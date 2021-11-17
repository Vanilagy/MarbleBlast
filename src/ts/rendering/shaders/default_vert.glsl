#version 300 es
precision highp float;

#include <definitions>

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec2 uv;
in float meshInfoIndex;
in float materialIndex;

uniform mat4 meshInfos[MESH_COUNT];
uniform highp uvec4 materials[MATERIAL_COUNT];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float logDepthBufFC; // Some coefficient
uniform bool skipTransparent;
uniform mat4 directionalLightTransform[DIRECTIONAL_LIGHT_COUNT];
uniform vec3 eyePosition;

out float vMaterialIndex;
out vec4 vPosition;
out vec2 vUv;
out vec3 vNormal;
out float vFragDepth;
out float vOpacity;
out vec4 vShadowPosition[DIRECTIONAL_LIGHT_COUNT];
out float vReceiveShadows;
out vec3 vReflect;
out mat3 vTbn;

// http://www.thetenthplanet.de/archives/1180
mat3 inverse3x3(mat3 M) {
	mat3 M_t = transpose(M);
	float det = dot(cross(M_t[0], M_t[1]), M_t[2]);
	mat3 adjugate = mat3(cross(M_t[1], M_t[2]), cross(M_t[2], M_t[0]), cross(M_t[0], M_t[1]));
	return adjugate / det;
}

void main() {
	mat4 meshInfo = meshInfos[int(meshInfoIndex)];
	mat4 transform = meshInfo;
	transform[0][3] = 0.0;
	transform[1][3] = 0.0;
	transform[2][3] = 0.0;
	transform[3][3] = 1.0;
	float opacity = meshInfo[0][3];
	int meshFlags = int(meshInfo[1][3]);

	uvec4 material = materials[int(materialIndex)];
	uint materialType = (material.x >> 29) & 7u;
	float materialOpacity = float(material.x >> 16 & 255u) / 255.0;

	if (skipTransparent && (opacity * materialOpacity) < 1.0) {
		gl_Position = vec4(0.0);
		return;
	}

	vReceiveShadows = float(meshFlags & 1);

	if (materialType == 1u) {
		vPosition = vec4(position, 1.0);
		gl_Position = vec4(position, 1.0);
	} else {
		bool transparent = ((material.x >> 27) & 1u) != 0u;
		if (skipTransparent && transparent) {
			gl_Position = vec4(0.0);
			return;
		}

		vec4 worldPosition = transform * vec4(position, 1.0);
		vPosition = worldPosition;

		vec4 transformed = viewMatrix * worldPosition;
		transformed = projectionMatrix * transformed;

		vMaterialIndex = materialIndex;
		vUv = uv;

		mat3 normalTransform = transpose(inverse3x3(mat3(transform)));

		vec3 transformedNormal = normalTransform * normal;
		bool normalizeNormal = ((material.x >> 25) & 1u) != 0u;
		if (normalizeNormal) transformedNormal = normalize(transformedNormal);
		vNormal = transformedNormal;

		vec3 N = transformedNormal;
		vec3 T = normalize((transform * vec4(tangent.xyz, 0.0)).xyz);
		// re-orthogonalize T with respect to N
		T = normalize(T - dot(T, N) * N);
		// then retrieve perpendicular vector B with the cross product of T and N
		vec3 B = cross(N, T);
		mat3 tbn = mat3(T, B, N);
		vTbn = tbn;

		vec3 incidentRay = normalize(worldPosition.xyz - eyePosition);
		vec3 reflected = reflect(incidentRay, normalize(transformedNormal));
		vReflect = reflected;

		gl_Position = transformed;

		for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; ++i) {
			vec4 transformed = directionalLightTransform[i] * worldPosition;
			vShadowPosition[i] = transformed;
		}
	}

	vFragDepth = 1.0 + gl_Position.w;
	vOpacity = opacity;
}