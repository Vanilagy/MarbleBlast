precision mediump float;

#define SHADOW_RADIUS 2
#include <definitions>

// This condition here is necessary to save on varying vectors; some mobile devices (*cough* iPhones *cough*) only support 8 varying vec4s, and this separation here makes sure we stay just under that. If, in the future, more varyings will be necessary, this condition can always be refined more. Also, apparently I'm not allowed to indent 'varying'.
#ifdef IS_SKY
varying vec3 eyeDirection;
#else
varying vec4 vPosition;
varying vec2 vUv;
varying vec3 vNormal;
//varying vec4 vTangent; // Using this drops support with WebGL 1 on iOS, too many varyings
varying float vOpacity;
varying vec4 vShadowPosition;
varying vec3 vReflect;
varying mat3 vTbn; // Matrix used to transform the normal map vectors
varying float vFragDepth;
varying float vIsPerspective;
#endif

uniform sampler2D diffuseMap;
uniform samplerCube envMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform sampler2D noiseMap;

uniform float reflectivity;
uniform highp vec3 eyePosition;
uniform float specularIntensity;
uniform float shininess;
uniform float logDepthBufFC;
uniform float secondaryMapUvFactor;
uniform int debugMode;

uniform vec3 ambientLight;
uniform vec3 directionalLightColor;
uniform vec3 directionalLightDirection;
uniform mediump sampler2D directionalLightShadowMap;

#if defined(LOG_DEPTH_BUF) && defined(IS_WEBGL1)
	#extension GL_EXT_frag_depth : enable // For some reason, the extension needs to be enabled in-shader
#endif

// Computes standard Lambertian reflectance
float lambert(vec3 normal, vec3 lightPosition) {
	float result = dot(normal, lightPosition);
	return max(result, 0.0);
}

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
#endif

vec4 sampleCubeTexture(samplerCube tex, vec3 uvw) {
	#ifdef ENV_MAP_Z_UP
		uvw.yz = vec2(uvw.z, -uvw.y); // Rotate the "cube" about the x-axis because by default, cubemaps are Y-up but we're in Z-up space
	#endif

	return textureCube(tex, uvw);
}

// Gets the intensity of a shadow given a point in shadow camera view space
float getShadowIntensity(sampler2D map, vec4 shadowPosition, int mapSize) {
	vec3 projectedTexcoord = shadowPosition.xyz / shadowPosition.w;
	projectedTexcoord = (projectedTexcoord + vec3(1.0)) / 2.0; // From [-1, 1] to [0, 1]

	// Check if we're even within the bounds of the shadow texture
	bool inBounds =
		min(projectedTexcoord.x, min(projectedTexcoord.y, projectedTexcoord.z)) > 0.0 &&
		max(projectedTexcoord.x, max(projectedTexcoord.y, projectedTexcoord.z)) < 1.0;
	
	if (!inBounds) return 0.0; // If not, say there's no shadow

	float mapSizeF = float(mapSize);
	float total = 0.0;

	// Sample the texture in an area to soften it a bit
	for (int x = -SHADOW_RADIUS; x <= SHADOW_RADIUS; x++) {
		for (int y = -SHADOW_RADIUS; y <= SHADOW_RADIUS; y++) {
			vec2 uv = projectedTexcoord.xy + vec2(float(x) / mapSizeF, float(y) / mapSizeF);
			float depthValue = texture2D(map, uv.xy).r;
			if (depthValue < projectedTexcoord.z) total += 1.0;
		}
	}

	return mix(total / float((SHADOW_RADIUS*2+1)*(SHADOW_RADIUS*2+1)), 0.0, projectedTexcoord.z * projectedTexcoord.z);
}

// Fresnel-Schlick approximation
float fresnel(vec3 direction, vec3 normal, bool invert) {
	vec3 nDirection = normalize(direction);
	vec3 nNormal = normalize(normal);
	vec3 halfDirection = normalize(nNormal + nDirection);

	float exponent = 5.0;
	float cosine = dot(halfDirection, nDirection);
	float product = max(cosine, 0.0);
	float factor = invert ? 1.0 - pow(product, exponent) : pow(product, exponent);
	
	return factor;
}

void main() {
	#if defined(LOG_DEPTH_BUF) && !defined(IS_SKY)
		// We always need to set gl_FragDepthEXT when it's present in the file, otherwise it gets real weird
		// Also: Doing a strict comparison with == 1.0 can cause noise artifacts
		gl_FragDepthEXT = (vIsPerspective != 0.0)? log2(vFragDepth) * logDepthBufFC * 0.5 : gl_FragCoord.z;
	#endif

	#ifdef IS_SKY
		// We simply sample the skybox cube texture and we're done.
		vec4 sampled = sampleCubeTexture(envMap, eyeDirection);
		gl_FragColor = sampled;
	#elif defined(IS_SHADOW)
		bool hasDirectionalLight = dot(directionalLightDirection, directionalLightDirection) > 0.0;
		float intensity = getShadowIntensity(directionalLightShadowMap, vShadowPosition, 250);
		if (!hasDirectionalLight) intensity = 0.0;
		
		gl_FragColor = vec4(vec3(0.0), intensity * 0.25); // Note that this intensity differs from the one used in the normal shader path. That's because with a separate shadow material, it's actually difficult to figure out how dark the shadow should be - so whatever value we picked here just looked the least odd.
	#else
		vec4 diffuse = vec4(1.0);

		#ifdef USE_DIFFUSE_MAP
			diffuse = texture2D(diffuseMap, vUv);
			#ifndef TRANSPARENT
				diffuse.a = 1.0;
			#endif
		#endif

		#ifdef USE_NOISE_MAP
			// Sample the noise texture multiple times to create the tiling effect found in MBU textures. Code is taken from MBU shaders!

			vec2 noiseIndex;
			vec4 noiseColor[4];
			vec2 halfPixel = vec2(1.0 / 64.0, 1.0 / 64.0);

			noiseIndex.x = floor(vUv.x - halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(vUv.y - halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[0] = texture2D(noiseMap, noiseIndex) * 1.0 - 0.5;

			noiseIndex.x = floor(vUv.x - halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(vUv.y + halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[1] = texture2D(noiseMap, noiseIndex) * 1.0 - 0.5;

			noiseIndex.x = floor(vUv.x + halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(vUv.y + halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[2] = texture2D(noiseMap, noiseIndex) * 1.0 - 0.5;

			noiseIndex.x = floor(vUv.x + halfPixel.x) / 63.0 + 0.5/64.0;
			noiseIndex.y = floor(vUv.y - halfPixel.y) / 63.0 + 0.5/64.0;
			noiseColor[3] = texture2D(noiseMap, noiseIndex) * 1.0 - 0.5;

			vec4 finalNoiseCol = (noiseColor[0] + noiseColor[1] + noiseColor[2] + noiseColor[3]) / 4.0;
			diffuse.rgb *= 1.0 + finalNoiseCol.r; // This isn't how MBU does it afaik but it looks good :o
		#endif

		diffuse.a *= vOpacity; // Multiply the diffuse by the whole mesh's opacity (and the material's opacity)

		vec3 incomingLight = vec3(0.0);
		vec3 specularLight = vec3(0.0);

		#ifdef EMISSIVE
			incomingLight = vec3(1.0);
		#else
			incomingLight += ambientLight;

			vec3 normal = vNormal;

			#ifdef USE_NORMAL_MAP
				// Overwrite the normal with the sampled one
				vec3 map = texture2D(normalMap, secondaryMapUvFactor * vUv).xyz;
				map = map * 255.0/127.0 - 128.0/127.0;
				#ifdef INVERT_U
					map.x = -map.x;
				#endif
				normal = vTbn * map; // Don't normalize here! Reduces aliasing effects
			#endif

			vec3 addedLight = directionalLightColor * lambert(normal, -directionalLightDirection);

			#ifdef SATURATE_INCOMING_LIGHT
				// MBG saturates the incoming light to be at most 1.0
				addedLight = min(vec3(1.0), incomingLight + addedLight) - incomingLight;
			#endif

			#ifdef RECEIVE_SHADOWS
				// When the direction has zero length, we make the assumption that there is no directional light in the scene.
				bool hasDirectionalLight = dot(directionalLightDirection, directionalLightDirection) > 0.0;
				float intensity = getShadowIntensity(directionalLightShadowMap, vShadowPosition, 250);
				if (!hasDirectionalLight) intensity = 0.0;

				addedLight *= mix(1.0, 0.666, intensity);
			#endif
			
			incomingLight += addedLight;

			#ifdef USE_SPECULAR
				vec3 viewDir = normalize(eyePosition - vPosition.xyz);
				vec3 halfwayDir = normalize(-directionalLightDirection + viewDir); // Blinn-Phong

				float spec = pow(max(dot(normal, halfwayDir), 0.0), shininess);

				#ifdef USE_SPECULAR_MAP
					spec *= texture2D(specularMap, secondaryMapUvFactor * vUv).r;
				#endif

				specularLight += vec3(specularIntensity * spec);
			#endif
		#endif

		vec4 shaded = diffuse * vec4(incomingLight, 1.0);
		shaded.rgb += specularLight;

		#ifdef USE_ENV_MAP
			#ifdef USE_FRESNEL
				// Fresnel causes the reflectivity to increase with incresing angle of incidence
				vec3 viewDir = normalize(eyePosition - vPosition.xyz);
				float fac = fresnel(viewDir, normal, true);
			#else
				float fac = 1.0;
			#endif

			#ifdef USE_ACCURATE_REFLECTION_RAY
				// The reflection ray tends to be much more accurate when computed using the interpolated normal rather than interpolating the reflection ray itself; but it's more expensive and sometimes looks too boring
				vec3 incidentRay = normalize(vPosition.xyz - eyePosition);
				vec3 reflectionRay = reflect(incidentRay, normalize(vNormal));
			#else
				vec3 reflectionRay = vReflect;
			#endif

			vec4 sampled = sampleCubeTexture(envMap, reflectionRay);
			sampled.a *= vOpacity;
			
			shaded = mix(shaded, sampled, fac * reflectivity);
		#endif

		#ifdef USE_NORMAL_MAP
			if (debugMode == 0) {}
			else if (debugMode == 1) {
				shaded = vec4(mod(vUv, 1.0f), 0, 1);
			}
			else if (debugMode == 2) {
				shaded = vec4((vNormal + 1.0f) / 2.0f, 1);
			}
			else if (debugMode == 3) {
				shaded = vec4((map + 1.0f) / 2.0f, 1);
			}
			else if (debugMode == 4) {
				shaded = vec4((normal + 1.0f) / 2.0f, 1);
			}
			/*
			if (debugMode == 5) {
				shaded = vec4((vTangent.xyz + 1.0f) / 2.0f, 1);
			}
			if (debugMode == 6) {
				shaded = vec4(vec3((vTangent.w + 1.0f) / 2.0f), 1);
			}
			*/
			else if (debugMode == 7) {
				shaded = vec4((vTbn[0] + 1.0f) / 2.0f, 1);
			}
			else if (debugMode == 8) {
				shaded = vec4((vTbn[1] + 1.0f) / 2.0f, 1);
			}
			else if (debugMode == 9) {
				shaded = vec4((vTbn[2] + 1.0f) / 2.0f, 1);
			}
		#endif
		gl_FragColor = shaded;
		#ifdef USE_PREMULTIPLIED_ALPHA
			gl_FragColor.rgb *= gl_FragColor.a;
		#endif
	#endif
}