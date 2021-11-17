#version 300 es
precision mediump float;
precision highp int;

#include <definitions>

in float vMaterialIndex;
in vec4 vPosition;
in vec2 vUv;
in vec3 vNormal;
in float vFragDepth;
in float vOpacity;
in vec4 vShadowPosition[DIRECTIONAL_LIGHT_COUNT];
in float vReceiveShadows;
in vec3 vReflect;
in mat3 vTbn;

uniform highp uvec4 materials[MATERIAL_COUNT];
uniform mediump sampler2DArray textures;
uniform mediump samplerCube cubeTextures[4];
uniform highp mat4 viewMatrix;
uniform highp mat4 inverseProjectionMatrix;
uniform float logDepthBufFC;
uniform highp vec3 eyePosition;

uniform vec3 ambientLight;
uniform vec3 directionalLightColor[DIRECTIONAL_LIGHT_COUNT];
uniform vec3 directionalLightDirection[DIRECTIONAL_LIGHT_COUNT];
uniform mediump sampler2D directionalLightShadowMap[DIRECTIONAL_LIGHT_COUNT];
uniform mat4 directionalLightTransform[DIRECTIONAL_LIGHT_COUNT];

out vec4 FragColor;

float lambert(vec3 normal, vec3 lightPosition) {
	float result = dot(normal, lightPosition);
	return max(result, 0.0);
}

float getShadowIntensity(sampler2D map, vec4 shadowPosition, int radius, int mapSize) {
	vec3 projectedTexcoord = shadowPosition.xyz / shadowPosition.w;
	projectedTexcoord = (projectedTexcoord + vec3(1.0)) / 2.0; // From [-1, 1] to [0, 1]

	bool inBounds =
		min(projectedTexcoord.x, min(projectedTexcoord.y, projectedTexcoord.z)) > 0.0 &&
		max(projectedTexcoord.x, max(projectedTexcoord.y, projectedTexcoord.z)) < 1.0;
	
	if (!inBounds) return 0.0;

	float mapSizeF = float(mapSize);
	float total = 0.0;

	for (int x = -radius; x <= radius; x++) {
		for (int y = -radius; y <= radius; y++) {
			vec2 uv = projectedTexcoord.xy + vec2(float(x) / mapSizeF, float(y) / mapSizeF);
			float depthValue = texture(map, uv.xy).r;
			if (depthValue < projectedTexcoord.z) total += 1.0;
		}
	}

	return mix(total / float((radius*2+1)*(radius*2+1)), 0.0, projectedTexcoord.z * projectedTexcoord.z);
}

vec4 sampleCubeTexture(int index, vec3 uvw) {
	uvw.yz = vec2(uvw.z, -uvw.y); // Rotate the "cube" about the x-axis because by default, cubemaps are Y-up but we're in Z-up space

	vec4 sampled = vec4(0.0); // GLSL moment here:
	if (index == 0) sampled = texture(cubeTextures[0], uvw);
	if (index == 1) sampled = texture(cubeTextures[1], uvw);
	if (index == 2) sampled = texture(cubeTextures[2], uvw);
	if (index == 3) sampled = texture(cubeTextures[3], uvw);

	return sampled;
}

void main() {
	uvec4 material = materials[int(round(vMaterialIndex))];
	uint materialType = (material.x >> 29) & 7u;

	//if (materialType != 0u) discard;

	if (materialType == 1u) {
		mat3 inverseModelView = transpose(mat3(viewMatrix));
		vec3 unprojected = (inverseProjectionMatrix * vPosition).xyz;
		vec3 eyeDirection = inverseModelView * unprojected;
		int textureIndex = (int(material.y >> 19) & 7) - 1;

		vec4 sampled = sampleCubeTexture(textureIndex, eyeDirection);
		FragColor = sampled;

		gl_FragDepth = 1.0;
	} else if (materialType == 2u) {
		float intensity = getShadowIntensity(directionalLightShadowMap[0], vShadowPosition[0], 2, 250);
		FragColor = vec4(vec3(0.0), intensity * 0.25);
	} else {
		vec4 diffuse;
		int textureIndex = int(material.y >> 22) - 1;
		vec2 uv = vUv;
		bool flipY = ((material.x >> 24) & 1u) != 0u;
		if (flipY) uv.t = 1.0 - uv.t;
		vec3 normal = vNormal;
		bool doubleSecondaryMapUvs = ((material.x >> 6) & 1u) != 0u;
		float uvFac = doubleSecondaryMapUvs? 2.0 : 1.0;

		int normalMapTextureIndex = int(material.z >> 22) - 1;
		if (normalMapTextureIndex != -1) {
			vec3 map = texture(textures, vec3(uvFac * uv, normalMapTextureIndex)).xyz;
			map = map * 255.0/127.0 - 128.0/127.0;
			normal = vTbn * map; // Don't normalize here! Reduces aliasing effects
		}

		if (textureIndex != -1) { 
			bool transparent = ((material.x >> 27) & 1u) != 0u;
			vec4 sampled = texture(textures, vec3(uv, textureIndex));

			float materialOpacity = float(material.x >> 16 & 255u) / 255.0;
			if (!transparent) sampled.a = 1.0;
			else sampled.a *= materialOpacity;

			diffuse = sampled;
		} else {
			diffuse = vec4(1.0);
		}

		/*
		int noiseMapTextureIndex = int((material.z >> 12) & 1023u) - 1;
		if (noiseMapTextureIndex != -1) {
			vec2 noiseIndex;
			vec4 noiseColor[4];
			vec2 halfPixel = vec2(1.0 / 64.0, 1.0 / 64.0);

			noiseIndex.x = floor(uv.x - halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(uv.y - halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[0] = texture(textures, vec3(noiseIndex, noiseMapTextureIndex)) * 1.0 - 0.5;

			noiseIndex.x = floor(uv.x - halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(uv.y + halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[1] = texture(textures, vec3(noiseIndex, noiseMapTextureIndex)) * 1.0 - 0.5;

			noiseIndex.x = floor(uv.x + halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(uv.y + halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[2] = texture(textures, vec3(noiseIndex, noiseMapTextureIndex)) * 1.0 - 0.5;

			noiseIndex.x = floor(uv.x + halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(uv.y - halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[3] = texture(textures, vec3(noiseIndex, noiseMapTextureIndex)) * 1.0 - 0.5;

			vec4 finalNoiseCol = (noiseColor[0] + noiseColor[1] + noiseColor[2] + noiseColor[3]) / 4.0;
			diffuse.rgb *= 1.0 + finalNoiseCol.r; // This isn't how MBU does it afaik but it looks good :o
		}
		*/

		vec3 incomingLight = vec3(0.0);
		vec3 specularLight = vec3(0.0);
		bool emissive = ((material.x >> 28) & 1u) != 0u;

		if (emissive) {
			incomingLight = vec3(1.0);
		} else {
			incomingLight += ambientLight;

			/*

			float specularIntensity = 4.0 * float((material.w >> 24) & 255u) / 255.0;
			float shininess = float((material.w >> 16) & 255u);
			bool saturateIncomingLight = ((material.x >> 7) & 1u) != 0u;

			int specularMapTextureIndex = int((material.y >> 9) & 1023u) - 1;
			float specSample = 1.0;
			if (specularMapTextureIndex != -1) {
				vec4 sampled = texture(textures, vec3(uvFac * uv, specularMapTextureIndex));
				specSample = sampled.r;
			}

			for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; ++i) {
				vec3 color = directionalLightColor[i];
				vec3 direction = directionalLightDirection[i];
				if (direction.x == 0.0) continue; // Assume the light isn't set

				vec3 addedLight = color * lambert(normal, -direction);

				if (vReceiveShadows > 0.0) {
					float intensity = getShadowIntensity(directionalLightShadowMap[0], vShadowPosition[0], 2, 250);
					addedLight *= mix(1.0, 0.5, intensity);
				}

				incomingLight += addedLight;
				if (saturateIncomingLight) incomingLight = min(vec3(1.0), incomingLight);

				if (specularIntensity > 0.0) {
					vec3 viewDir = normalize(eyePosition - vPosition.xyz);
					vec3 halfwayDir = normalize(-direction + viewDir);

					float spec = pow(max(dot(normal, halfwayDir), 0.0), shininess);
					spec *= specSample;

					specularLight += vec3(specularIntensity * spec);
				}
			}
			*/
		}

		vec4 shaded = diffuse * vec4(incomingLight, 1.0);
		shaded.rgb += specularLight;

		

		int envMapTextureIndex = (int(material.y >> 19) & 7) - 1;
		if (envMapTextureIndex != -1) {
			vec4 sampled = sampleCubeTexture(envMapTextureIndex, vReflect);

			float reflectivity = float(material.x >> 8 & 255u) / 255.0;
			shaded = mix(shaded, sampled, reflectivity);
		}
		
		bool additive = ((material.x >> 26) & 1u) != 0u;
		FragColor = shaded;
		FragColor.a *= vOpacity;
		FragColor.rgb *= FragColor.a;
		if (additive) FragColor.a = 0.0;
		
	}

	if (materialType == 0u || materialType == 2u) {
		gl_FragDepth = log2(vFragDepth) * logDepthBufFC * 0.5;
	}
}