precision highp float;

#include <definitions>

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute float meshInfoIndex;

uniform mat4 meshInfos[MESH_COUNT];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float logDepthBufFC; // Some coefficient

varying vec4 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

mat3 transpose(mat3 inMatrix) {
	vec3 i0 = inMatrix[0];
	vec3 i1 = inMatrix[1];
	vec3 i2 = inMatrix[2];

	mat3 outMatrix = mat3(
		vec3(i0.x, i1.x, i2.x),
		vec3(i0.y, i1.y, i2.y),
		vec3(i0.z, i1.z, i2.z)
	);

	return outMatrix;
}

// http://www.thetenthplanet.de/archives/1180
mat3 inverse(mat3 M) {
	mat3 M_t = transpose(M);
	float det = dot(cross(M_t[0], M_t[1]), M_t[2]);
	mat3 adjugate = mat3(cross(M_t[1], M_t[2]), cross(M_t[2], M_t[0]), cross(M_t[0], M_t[1]));
	return adjugate / det;
}

void main() {
#ifdef IS_SKY
	vPosition = vec4(position, 1.0);
	gl_Position = vec4(position, 1.0);
#else
	mat4 meshInfo = meshInfos[int(meshInfoIndex)];
	mat4 transform = meshInfo;
	transform[0][3] = 0.0;
	transform[1][3] = 0.0;
	transform[2][3] = 0.0;
	transform[3][3] = 1.0;
	float opacity = meshInfo[0][3];
	int meshFlags = int(meshInfo[1][3]);

	vec4 worldPosition = transform * vec4(position, 1.0);
	vec4 transformed = viewMatrix * worldPosition;
	transformed = projectionMatrix * transformed;

	vUv = uv;
#ifdef FLIP_Y
	vUv.y = 1.0 - vUv.y;
#endif

	mat3 normalTransform = transpose(inverse(mat3(transform)));

	vec3 transformedNormal = normalTransform * normal;
#ifdef NORMALIZE_NORMALS
	transformedNormal = normalize(transformedNormal);
#endif
	vNormal = transformedNormal;

	gl_Position = transformed;
#endif
}