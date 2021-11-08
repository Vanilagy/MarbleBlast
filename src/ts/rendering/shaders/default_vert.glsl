#version 300 es
precision highp float;

#include <definitions>

in vec3 position;
in vec3 normal;
in vec2 uv;
in float meshInfoIndex;
in float materialIndex;

uniform mat4 meshInfos[MESH_COUNT];
uniform highp uvec4 materials[MATERIAL_COUNT];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float logDepthBufFC; // Some coefficient
uniform bool skipTransparent;

out float vMaterialIndex;
out vec4 vPosition;
out vec2 vUv;
out vec3 vNormal;
out float vFragDepth;
out float vOpacity;

void main() {
	mat4 meshInfo = meshInfos[int(meshInfoIndex)];
	mat4 transform = meshInfo;
	transform[0][3] = 0.0;
	transform[1][3] = 0.0;
	transform[2][3] = 0.0;
	transform[3][3] = 1.0;
	float opacity = meshInfo[0][3];

	if (skipTransparent && opacity < 1.0) {
		gl_Position = vec4(0.0);
		return;
	}

	uvec4 material = materials[int(materialIndex)];
	uint materialType = (material.x >> 29) & 7u;

	if (materialType == 1u) {
		vPosition = vec4(position, 1.0);
		gl_Position = vec4(position, 1.0);
	} else {
		bool transparent = ((material.x >> 27) & 1u) != 0u;
		if (skipTransparent && transparent) {
			gl_Position = vec4(0.0);
			return;
		}

		vec4 transformed = transform * vec4(position, 1.0);
		transformed = viewMatrix * transformed;
		transformed = projectionMatrix * transformed;

		vMaterialIndex = materialIndex;
		vUv = uv;

		vec3 transformedNormal = (transform * vec4(normal, 0.0)).xyz;
		vNormal = transformedNormal;

		gl_Position = transformed;
	}

	vFragDepth = 1.0 + gl_Position.w;
	vOpacity = opacity;
}