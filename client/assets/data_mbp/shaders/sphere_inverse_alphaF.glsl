//-----------------------------------------------------------------------------
// Copyright (c) 2020 Whirligig231
// Copyright (c) 2021 The Platinum Team
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
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.
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

void main() {
    // Correct UV based on texture scale
    vec2 scaled_uv = uv;

    // Texture values
    vec4 material_color = texture2D(textureSampler, scaled_uv);

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
    // Reflect the camera off the normal so we know where on the skysphere to show
    vec3 camera_reflection = reflect(camera_direction, normal_model);

    // Reflected coordinates onto the given skybox
    vec3 skyboxR = camera_reflection;
    // Get the color from the skybox
    vec4 reflectionColor = textureCube(skyboxSampler, skyboxR);
    // Apply the reflected skybox color
    float reflectAmount = invSigmoid(0.01 + 0.98 * (1.0 - material_color.a));
    reflectAmount -= 0.7 * (2.0 * -dot(normal_model, camera_direction) - 1.0);
    reflectAmount = sigmoid(reflectAmount);
    reflectAmount = 0.95 * reflectAmount;

    gl_FragColor =
        vec4(mix(material_color.rgb * effectiveSun.rgb, reflectionColor.rgb, reflectAmount), 1);
    // gl_FragColor = vec4((1+normal_model)/2, 0);
}