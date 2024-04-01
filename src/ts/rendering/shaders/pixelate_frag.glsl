precision mediump float;

#include <definitions>

varying vec2 v_texCoord;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blockSize;

void main() {
    vec2 blockUV = floor(v_texCoord * u_resolution / u_blockSize) * u_blockSize / u_resolution;
    gl_FragColor = texture2D(u_texture, blockUV);
}