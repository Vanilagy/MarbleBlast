precision mediump float;

#include <definitions>

varying vec2 vUv;
varying float vFragDepth;
varying float vIsPerspective;
varying vec4 color;

uniform sampler2D diffuseMap;
uniform float logDepthBufFC;

#if defined(LOG_DEPTH_BUF) && defined(IS_WEBGL1)
	#extension GL_EXT_frag_depth : enable
#endif

void main() {
	gl_FragColor = color * texture2D(diffuseMap, vUv);
	
	#ifdef LOG_DEPTH_BUF
		// We always need to set gl_FragDepthEXT when it's present in the file, otherwise it gets real weird
		// Also: Doing a strict comparison with == 1.0 can cause noise artifacts
		gl_FragDepthEXT = (vIsPerspective != 0.0)? log2(vFragDepth) * logDepthBufFC * 0.5 : gl_FragCoord.z;
	#endif
}