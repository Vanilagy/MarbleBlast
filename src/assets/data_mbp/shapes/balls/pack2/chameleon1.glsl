//-----------------------------------------------------------------------------
// Copyright 2020 Whirligig231
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
//-----------------------------------------------------------------------------

varying vec2 uv;
varying vec3 vert_position;
varying vec3 normal_vector;

uniform sampler2D textureSampler;
// uniform sampler2D normalSampler;
#if (QUALITY_LEVEL > 0)
// uniform sampler2D specularSampler;
#endif
uniform samplerCube skyboxSampler;

uniform vec3 camera_position;
uniform mat4 rot_from_torque_mat;
uniform mat4 rot_to_torque_mat;
uniform mat4 model_mat;
uniform vec4 ambient_color;
uniform vec4 sun_color;
uniform vec3 sun_direction;

float tanh(float x) {
    return (exp(2.0 * x) - 1.0) / (exp(2.0 * x) + 1.0);
}

float sigmoid(float x) {
    return 0.5 + 0.5 * tanh(2.0 * x - 1.0);
}

float atanh(float x) {
    return 0.5 * log((1.0 + x) / (1.0 - x));
}

float invSigmoid(float x) {
    return 0.5 + 0.5 * atanh(2.0 * x - 1.0);
}

vec2 uvFromNormal(vec3 normal_vector) {
    normal_vector = mat3(model_mat) * normal_vector;
    vec2 ret = vec2((atan(normal_vector.y, normal_vector.x) + 3.14159265) / (2 * 3.14159265),
                    (atan(-normal_vector.z, sqrt(normal_vector.x * normal_vector.x +
                                                 normal_vector.y * normal_vector.y)) +
                     3.14159265 / 2.0) /
                        3.14159265);
    return ret;
}

void main() {
    // Correct UV based on texture scale
    vec2 scaled_uv = uv;

    // Texture values
    vec4 material_color = texture2D(textureSampler, uvFromNormal(normal_vector));

    // Normalize the light vector so we can dot it
    vec3 light_normal = normalize(-sun_direction);

    // Cosine of the angle from the light to the normal
    float cosTheta = clamp(dot(normal_vector, light_normal), 0, 1);

    // Sun color is multiplied by angle for bump mapping, then clamped to [0, 1] so we don't clip
    vec4 effectiveSun = sun_color * cosTheta;

    // Ambient color first
    effectiveSun += ambient_color;

    // Clamp sun so we don't clip
    effectiveSun = vec4(clamp(effectiveSun.r, 0, 1), clamp(effectiveSun.g, 0, 1),
                        clamp(effectiveSun.b, 0, 1), 1);

    // Worldspace normal taking normal mapping into account
    vec3 normal_model = normal_vector;  // normalize(reflect(-normal_vector, normal_color));
    // Direction from camera to vertex
    vec3 camera_direction = normalize(vert_position - camera_position);

    vec3 outNormal =
        normalize(normal_model + camera_direction * (normal_model.z + 1.0) / (-camera_direction.z));
    vec4 chameleonColor = textureCube(skyboxSampler, outNormal);
    chameleonColor = vec4(chameleonColor.rgb / effectiveSun.rgb, 1);
    chameleonColor.r = clamp(chameleonColor.r, 0, 1);
    chameleonColor.g = clamp(chameleonColor.g, 0, 1);
    chameleonColor.b = clamp(chameleonColor.b, 0, 1);

    gl_FragColor = vec4(mix(material_color.rgb, chameleonColor.rgb, 0.4 + material_color.a * 0.5) *
                            effectiveSun.rgb,
                        1);
}