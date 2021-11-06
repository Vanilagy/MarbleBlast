#version 300 es
precision mediump float;

#include <definitions>

in float vMaterialIndex;
in vec4 vPosition;
in vec2 vUv;
in vec3 vNormal;
in float vFragDepth;
in float vIsPerspective;

uniform highp uvec4 materials[MATERIAL_COUNT];
uniform mediump sampler2DArray textures;
uniform mediump samplerCube cubeTextures[4];
uniform highp mat4 viewMatrix;
uniform highp mat4 inverseProjectionMatrix;
uniform float logDepthBufFC;

#define DIRECTIONAL_LIGHT_COUNT 2
uniform vec3 ambientLight;
uniform vec3 directionalLightColor[DIRECTIONAL_LIGHT_COUNT];
uniform vec3 directionalLightDirection[DIRECTIONAL_LIGHT_COUNT];

out vec4 FragColor;

float lambert(vec3 normal, vec3 lightPosition) {
	float result = dot(normal, lightPosition);
	return max(result, 0.0);
}

void main() {
	uvec4 material = materials[int(vMaterialIndex)];
	uint materialType = (material.x >> 29) & 7u;

	if (materialType == 1u) {
		mat3 inverseModelView = transpose(mat3(viewMatrix));
		vec3 unprojected = (inverseProjectionMatrix * vPosition).xyz;
		vec3 eyeDirection = inverseModelView * unprojected;
		eyeDirection.yz = vec2(eyeDirection.z, -eyeDirection.y); // Rotate the "cube" about the x-axis because by default, cubemaps are Y-up but we're in Z-up space
		int textureIndex = int(material.y >> 30);

		vec4 sampled; // GLSL moment here:
		if (textureIndex == 0) sampled = texture(cubeTextures[0], eyeDirection);
		if (textureIndex == 1) sampled = texture(cubeTextures[1], eyeDirection);
		if (textureIndex == 2) sampled = texture(cubeTextures[2], eyeDirection);
		if (textureIndex == 3) sampled = texture(cubeTextures[3], eyeDirection);

		FragColor = sampled;

		gl_FragDepth = 1.0;
	} else {
		vec4 diffuse;
		int textureIndex = int(material.y >> 22) - 1;

		if (textureIndex != -1) { 
			bool transparent = ((material.x >> 27) & 1u) != 0u;
			vec4 sampled = texture(textures, vec3(vUv, float(textureIndex)));
			if (!transparent) sampled.a = 1.0;
			diffuse = sampled;
		} else {
			diffuse = vec4(1.0, 1.0, 1.0, 1.0);
		}

		vec3 incomingLight = vec3(0.0, 0.0, 0.0);
		bool emissive = ((material.x >> 28) & 1u) != 0u;

		if (emissive) {
			incomingLight = vec3(1.0, 1.0, 1.0);
		} else {
			incomingLight += ambientLight;

			for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; ++i) {
				vec3 color = directionalLightColor[i];
				vec3 direction = directionalLightDirection[i];

				incomingLight += color * lambert(vNormal, -direction);
				incomingLight = min(vec3(1.0, 1.0, 1.0), incomingLight);
			}
		}
		
		bool additive = ((material.x >> 26) & 1u) != 0u;
		FragColor = diffuse * vec4(incomingLight, 1.0);
		FragColor.rgb *= FragColor.a;
		if (additive) FragColor.a = 0.0;

		gl_FragDepth = log2(vFragDepth) * logDepthBufFC * 0.5;
	}
}