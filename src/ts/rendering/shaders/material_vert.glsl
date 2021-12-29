precision highp float;
precision highp int;

#include <definitions>

attribute vec3 position;
attribute vec3 normal;
attribute vec4 tangent;
attribute vec2 uv;
attribute float meshInfoIndex;

uniform highp sampler2D meshInfos; // This is where mesh transformation and other things about the mesh are stored in
uniform int meshInfoTextureWidth;
uniform int meshInfoTextureHeight;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform bool skipTransparent;
uniform mat4 directionalLightTransform;
uniform vec3 eyePosition;
uniform float materialOpacity;

varying vec4 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vOpacity;
varying vec4 vShadowPosition;
varying vec3 vReflect;
varying mat3 vTbn;
varying vec4 vTangent;
varying float vFragDepth;
varying float vIsPerspective;
varying vec3 eyeDirection;

#ifdef IS_WEBGL1
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
#endif

// _ here because on some systems, "mod" is already defined?
int _mod(int a, int n) {
	#ifdef IS_WEBGL1
		return a - n * (a / n);
	#else
		return a % n;
	#endif
}

// Gets the mesh info for the mesh at a specific index. The mesh info contains its transformation and other things.
mat4 getMeshInfo(int index) {
	// Figure out where we need to sample the texture
	ivec2 coords = ivec2(
		_mod(4 * index, meshInfoTextureWidth),
		(4 * index) / meshInfoTextureWidth
	);

	#ifdef IS_WEBGL1
		// Primitive way, sample with texture coordinates
		return mat4(
			texture2D(meshInfos, vec2(coords + ivec2(0, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(1, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(2, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(3, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight))
		);
	#else
		// Better way, sample with pixel coordinates
		return mat4(
			texelFetch(meshInfos, coords + ivec2(0, 0), 0),
			texelFetch(meshInfos, coords + ivec2(1, 0), 0),
			texelFetch(meshInfos, coords + ivec2(2, 0), 0),
			texelFetch(meshInfos, coords + ivec2(3, 0), 0)
		);
	#endif
}

bool isPerspectiveMatrix(mat4 m) {
	return m[2][3] == -1.0; // Taken from three.js, no clue how this works
}

void main() {
	#ifdef IS_SKY
		// https://gamedev.stackexchange.com/a/60377
		mat4 inverseProjection = inverseProjectionMatrix;
		mat3 inverseModelView = transpose(mat3(viewMatrix));
		vec3 unprojected = (inverseProjection * vec4(position, 1.0)).xyz;
		eyeDirection = inverseModelView * unprojected;
		
		gl_Position = vec4(position, 1.0);
	#else
		mat4 meshInfo = getMeshInfo(int(meshInfoIndex + 0.1)); // + 0.1 to make sure it casts correctly, lol
		mat4 transform = meshInfo;
		transform[0][3] = 0.0; // The last row of a transformation matrix is always the same, so set it to what it should be
		transform[1][3] = 0.0;
		transform[2][3] = 0.0;
		transform[3][3] = 1.0;
		float opacity = meshInfo[0][3];
		int meshFlags = int(meshInfo[1][3]);

		opacity *= materialOpacity;
		vOpacity = opacity;

		if (skipTransparent && opacity < 1.0) {
			// The object isn't fully opaque, so skip it
			gl_Position = vec4(0.0);
			return;
		}

		vec4 worldPosition = transform * vec4(position, 1.0);
		vPosition = worldPosition;

		mat4 mvp = projectionMatrix * viewMatrix * transform; // Combine them into a single matrix to reduce possible precision errors
		gl_Position = mvp * vec4(position, 1.0);

		vUv = uv;
		#ifdef FLIP_Y
			vUv.y = 1.0 - vUv.y;
		#endif

		// Compute the transformation matrix for normals (not tangents, tho!)
		// Note that when the transformation doesn't involve any scaling, the upper mat3 part is orthonormal meaning its inverse is equal to its transpose. In this case, normalTransform == mat3(transform).
		mat3 normalTransform = transpose(inverse(mat3(transform)));

		vec3 transformedNormal = normalTransform * normal;
		#ifdef NORMALIZE_NORMALS
			// Many normals, like those used in the tornado, are actually not normalized
			transformedNormal = normalize(transformedNormal);
		#endif
		vNormal = transformedNormal;

		vTangent = tangent; // Needed so that it doesn't get optimized out (fucks with vertex attributes somehow)
		#ifdef USE_NORMAL_MAP
			vec3 N = transformedNormal;
			vec3 T = normalize((transform * vec4(tangent.xyz, 0.0)).xyz);
			// re-orthogonalize T with respect to N
			T = normalize(T - dot(T, N) * N);
			// then retrieve perpendicular vector B with the cross product of T and N
			vec3 B = cross(N, T) * tangent.w;
			mat3 tbn = mat3(T, B, N);
			vTbn = tbn;
		#endif

		#if defined(RECEIVE_SHADOWS) || defined(IS_SHADOW)
			// Compute where we are within shadow camera view space
			vShadowPosition = directionalLightTransform * worldPosition;
		#endif

		#if defined(USE_ENV_MAP) && !defined(USE_ACCURATE_REFLECTION_RAY)
			// Compute the reflection ray
			vec3 incidentRay = normalize(worldPosition.xyz - eyePosition);
			vec3 reflected = reflect(incidentRay, normalize(transformedNormal));
			vReflect = reflected;
		#endif

		#ifdef LOG_DEPTH_BUF
			// Some values we need to pass along for logarithmic depth buffer stuffs
			vFragDepth = 1.0 + gl_Position.w;
			vIsPerspective = float(isPerspectiveMatrix(projectionMatrix));
		#endif
	#endif
}