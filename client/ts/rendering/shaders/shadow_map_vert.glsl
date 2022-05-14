precision highp float;
precision highp int;

#include <definitions>

attribute vec3 position;
attribute float meshInfoIndex;

uniform highp sampler2D meshInfos;
uniform int meshInfoTextureWidth;
uniform int meshInfoTextureHeight;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

int _mod(int a, int n) {
	#ifdef IS_WEBGL1
		return a - n * (a / n);
	#else
		return a % n;
	#endif
}

// Refer to material_vert.glsl for an explanation of what this does
mat4 getMeshInfo(int index) {
	ivec2 coords = ivec2(
		_mod(4 * index, meshInfoTextureWidth),
		(4 * index) / meshInfoTextureWidth
	);

	#ifdef IS_WEBGL1
		return mat4(
			texture2D(meshInfos, vec2(coords + ivec2(0, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(1, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(2, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(3, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight))
		);
	#else
		return mat4(
			texelFetch(meshInfos, coords + ivec2(0, 0), 0),
			texelFetch(meshInfos, coords + ivec2(1, 0), 0),
			texelFetch(meshInfos, coords + ivec2(2, 0), 0),
			texelFetch(meshInfos, coords + ivec2(3, 0), 0)
		);
	#endif
}

void main() {
	mat4 meshInfo = getMeshInfo(int(meshInfoIndex + 0.1)); // + 0.1 to make sure it casts correctly, lol
	mat4 transform = meshInfo;
	transform[0][3] = 0.0;
	transform[1][3] = 0.0;
	transform[2][3] = 0.0;
	transform[3][3] = 1.0;
	float opacity = meshInfo[0][3];

	if (opacity < 1.0) {
		// Non-opaque objects don't cast shadows in our perfect world
		gl_Position = vec4(0.0);
		return;
	}

	// Simply transform the vertex and we're done
	mat4 mvp = projectionMatrix * viewMatrix * transform;
	gl_Position = mvp * vec4(position, 1.0);
}