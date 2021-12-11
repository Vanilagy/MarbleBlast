precision highp float;

#include <definitions>

attribute vec2 position;
attribute vec2 uv;
attribute float particleSpawnTime;
attribute float particleLifetime;
attribute vec3 particlePosition;
attribute vec3 particleVelocity;
attribute float particleInitialSpin;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform float time;
uniform float acceleration;
uniform float spinSpeed;
uniform float dragCoefficient;
uniform vec4 times;
uniform vec4 sizes;
uniform mat4 colors;

varying vec2 vUv;
varying float vFragDepth;
varying float vIsPerspective;
varying vec4 color;

bool isPerspectiveMatrix(mat4 m) {
	return m[2][3] == -1.0;
}

void main() {
	float elapsed = time - particleSpawnTime;
	float completion = clamp(elapsed / particleLifetime, 0.0, 1.0);

	if (completion == 1.0) {
		// We're dead, don't render
		gl_Position = vec4(0.0);
		return;
	}

	float velElapsed = elapsed / 1000.0;
	velElapsed = pow(velElapsed, 1.0 - dragCoefficient);

	// Compute the position
	vec3 computedPosition = particlePosition + particleVelocity * (velElapsed + acceleration * velElapsed * velElapsed / 2.0);
	float rotation = particleInitialSpin + spinSpeed * elapsed / 1000.0;

	// Check where we are in the times array
	int indexLow = 0;
	int indexHigh = 1;
	for (int i = 2; i < 4; ++i) {
		if (times[indexHigh] >= completion) break;

		indexLow = indexHigh;
		indexHigh = i;
	}
	if (times[1] > 1.0) indexHigh = indexLow;
	float t = (completion - times[indexLow]) / (times[indexHigh] - times[indexLow]);

	// Compute the color to send to the fragment shader
	color = mix(colors[indexLow], colors[indexHigh], t);
	color.a = pow(color.a, 1.5); // Adjusted because additive mixing can be kind of extreme

	vec4 mvPosition = viewMatrix * vec4(computedPosition, 1.0);

	vec2 scale = vec2(1.0);
	scale *= mix(sizes[indexLow], sizes[indexHigh], t); // Adjust sizing

	// Enable the following code if you don't want to attenuate the size with growing distance:
	// scale *= -mvPosition.z;

	vec2 center = vec2(0.5, 0.5); // Fixed, for now
	vec2 alignedPosition = (position - (center - vec2(0.5))) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos(rotation) * alignedPosition.x - sin(rotation) * alignedPosition.y;
	rotatedPosition.y = sin(rotation) * alignedPosition.x + cos(rotation) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;

	vUv = uv;

	#ifdef LOG_DEPTH_BUF
		vFragDepth = 1.0 + gl_Position.w;
		vIsPerspective = float(isPerspectiveMatrix(projectionMatrix));
	#endif
}