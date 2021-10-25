//-----------------------------------------------------------------------------
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

// Include support for texture arrays.
#extension GL_EXT_texture_array : require

varying vec2 uv;
varying vec3 light_vector;
varying vec3 eye_vector;
varying vec3 vert_position;
varying vec3 normal_vector;

uniform sampler2DArray textureSampler;
uniform sampler2D normalSampler;
#if (QUALITY_LEVEL > 0)
uniform sampler2D specularSampler;
#endif
#if (QUALITY_LEVEL > 1)
uniform samplerCube skyboxSampler;
#endif

uniform vec4 ambient_color;
uniform vec3 sun_direction;
uniform vec4 sun_color;
uniform float sun_power;
uniform int specular_exponent;
uniform vec3 camera_position;
uniform float reflectivity;
uniform vec2 textureScale;
uniform mat4 rot_from_torque_mat;

#define TEXTURE_GRIDS vec2(4.0, 1.0)
#define ORIGINAL_SIZE vec2(4.0, 4.0)

// Stupid simple noise
float noise(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

int randNoise(vec2 uv, int max) {
    // This is done by taking the floored UV (integer component) and running it through the
    //	above noise function. This value is then multiplied by the number of grids to get a
    // grid offset within the texture.
    vec2 base = floor(uv * textureScale);
    float rand = noise(base) * max;

    int irand = int(floor(rand));
    irand = int(mod(irand, max));
    return irand;
}

void main() {
    // Correct UV based on texture scale
    vec2 scaled_uv = uv * textureScale;

    // Figure out which texture we're going to use.
    // Calculate 3D textureArray position
    // note that 3 needs to be a uniform as that's the amount in the array.
    int slice = randNoise(uv, 3);
    vec3 array_uv = vec3(scaled_uv, slice);

    // Texture
    vec3 material_color = texture2DArray(textureSampler, array_uv).rgb;
    vec3 normal_color = normalize(texture2D(normalSampler, scaled_uv).rgb * 2.0 - 1.0);

    // Normalize the light vector so we can dot it
    vec3 light_normal = normalize(light_vector);

    // Cosine of the angle from the light to the normal
    float cosTheta = clamp(dot(normal_color, light_normal), 0, 1);

    // Sun color is multiplied by angle for bump mapping, then clamped to [0, 1] so we don't clip
    vec4 effectiveSun = sun_color * cosTheta;

    // Ambient color first
    effectiveSun += ambient_color;

    // Clamp sun so we don't clip
    effectiveSun = vec4(clamp(effectiveSun.r, 0, 1), clamp(effectiveSun.g, 0, 1),
                        clamp(effectiveSun.b, 0, 1), 1);

    // Diffuse color
    gl_FragColor = vec4(material_color * effectiveSun.rgb, 1);

// Only high quality gets reflections.
#if (QUALITY_LEVEL > 1)
    // Worldspace normal taking normal mapping into account
    vec3 normal_model = normalize(reflect(-normal_vector, normal_color));
    // Direction from camera to vertex
    vec3 camera_direction = normalize(vert_position - camera_position);
    // Reflect the camera off the normal so we know where on the skysphere to show
    vec3 camera_reflection = reflect(camera_direction, normal_model);

    // Reflected coordinates onto the given skybox
    vec3 skyboxR = mat3(rot_from_torque_mat) * camera_reflection;
    // Get the color from the skybox
    vec4 reflectionColor = textureCube(skyboxSampler, skyboxR);
    // Apply the reflected skybox color
    gl_FragColor = mix(gl_FragColor, reflectionColor, reflectivity);
#endif

// Low quality does not get specular highlights as it's a more expensive calculation.
#if (QUALITY_LEVEL > 0)
    vec3 specular_color = texture2D(specularSampler, scaled_uv).rgb;

    // Direction of the light reflection
    vec3 light_reflection = reflect(-light_normal, normal_color);

    // Angle from the eye vector and reflect vector
    float cosAlpha = clamp(dot(normalize(eye_vector), light_reflection), 0, 1.0);

    // Specular highlights
    gl_FragColor += vec4(specular_color * sun_color.rgb * pow(cosAlpha, specular_exponent), 1);
#endif
}