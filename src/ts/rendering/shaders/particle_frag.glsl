precision mediump float;

#include <definitions>

varying vec2 vUv;
varying float vFragDepth;
varying vec4 color;

uniform sampler2D diffuseMap;
uniform float logDepthBufFC;

void main() {
	gl_FragColor = color * texture2D(diffuseMap, vUv);

	#ifdef LOG_DEPTH_BUF
		gl_FragDepthEXT = log2(vFragDepth) * logDepthBufFC * 0.5;
	#endif
}