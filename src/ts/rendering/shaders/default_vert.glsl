#version 300 es
precision highp float;

#define EPSILON 1e-8
#include <definitions>

in vec3 position;
in vec3 normal;
in vec2 uv;
in float transformIndex;
in float materialIndex;

uniform mat4 transforms[TRANSFORM_COUNT];
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

void main() {
	mat4 transform = transforms[int(transformIndex)];
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
}