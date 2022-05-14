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

varying vec2 uv;
varying vec3 light_vector;
varying vec3 eye_vector;
varying vec3 vert_position;
varying vec3 normal_vector;

attribute vec3 tangent;
attribute vec3 bitangent;
attribute vec2 uv_shader;
attribute vec3 normal;

uniform mat4 model_mat;
uniform mat4 inverse_model_mat;
uniform vec3 model_position;
uniform vec3 sun_direction;

void main() {
    // Actual vertex position has this super ancient but helpful function for us
    gl_Position = ftransform();

    // UV coordinates are also provided
    // uv = gl_MultiTexCoord0.st;
    uv = uv_shader;

    // Normal relative to worldspace, make sure to account for the model rotation
    normal_vector = mat3(inverse_model_mat) * normal;  // gl_Normal;

    // Worldspace position of the vertex
    vert_position = model_position + (inverse_model_mat * gl_Vertex).xyz;

    // Cameraspace of the vertex position
    vec3 position_camera = (gl_ModelViewMatrix * gl_Vertex).xyz;

    // Direction from vertex to camera
    vec3 eye_camera = -position_camera;

    // Light direction in cameraspace. Once again oriented based on the model.
    vec3 light_camera = gl_NormalMatrix * mat3(model_mat) * -sun_direction;

    // Normal tangent bitangent in cameraspace
    vec3 normal_camera = gl_NormalMatrix * normal;
    vec3 tangent_camera = gl_NormalMatrix * tangent;
    vec3 bitangent_camera = gl_NormalMatrix * bitangent;

    // Matrix for converting cameraspace into tangentspace
    mat3 tbn = transpose(mat3(tangent_camera, bitangent_camera, normal_camera));

    // Light and eye/distance vectors in tangentspace.
    light_vector = tbn * light_camera;
    eye_vector = tbn * eye_camera;
}