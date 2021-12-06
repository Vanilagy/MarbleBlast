precision mediump float;
precision highp int;

#include <definitions>

uniform sampler2D diffuseMap;
uniform samplerCube envMap;

varying vec4 vPosition;
varying vec2 vUv;
varying vec3 vNormal;

uniform highp mat4 viewMatrix;
uniform highp mat4 inverseProjectionMatrix;

uniform vec3 ambientLight;
uniform vec3 directionalLightColor;
uniform vec3 directionalLightDirection;
uniform mediump sampler2D directionalLightShadowMap;
uniform mat4 directionalLightTransform;

float lambert(vec3 normal, vec3 lightPosition) {
	float result = dot(normal, lightPosition);
	return max(result, 0.0);
}

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

vec4 sampleCubeTexture(samplerCube tex, vec3 uvw) {
	uvw.yz = vec2(uvw.z, -uvw.y); // Rotate the "cube" about the x-axis because by default, cubemaps are Y-up but we're in Z-up space
	return textureCube(tex, uvw);
}

void main() {
#ifdef IS_SKY
	mat3 inverseModelView = transpose(mat3(viewMatrix));
	vec3 unprojected = (inverseProjectionMatrix * vPosition).xyz;
	vec3 eyeDirection = inverseModelView * unprojected;
	vec4 sampled = sampleCubeTexture(envMap, eyeDirection);

	gl_FragColor = sampled;
#else
	vec4 diffuse = vec4(1.0);
#ifdef USE_DIFFUSE
	diffuse = texture2D(diffuseMap, vUv);
#ifndef TRANSPARENT
	diffuse.a = 1.0;
#endif
#endif

	vec3 incomingLight = vec3(0.0);

#ifdef EMISSIVE
	incomingLight = vec3(1.0);
#else
	incomingLight += ambientLight;

	vec3 normal = vNormal;
	vec3 addedLight = directionalLightColor * lambert(normal, -directionalLightDirection);

	// if (vReceiveShadows > 0.0) {
	// 	float intensity = getShadowIntensity(directionalLightShadowMap[0], vShadowPosition[0], 2, 250);
	// 	addedLight *= mix(1.0, 0.5, intensity);
	// }

	incomingLight += addedLight;
	incomingLight = min(vec3(1.0), incomingLight);
#endif

	vec4 shaded = diffuse * vec4(incomingLight, 1.0);

	gl_FragColor = shaded;
#endif
}