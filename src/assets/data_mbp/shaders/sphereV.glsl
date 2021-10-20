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
varying vec3 vert_position;
varying vec3 normal_vector;

attribute vec2 uv_shader;
attribute vec3 normal;

uniform mat4 model_mat;
uniform mat4 inverse_model_mat;
uniform mat4 rot_from_torque_mat;
uniform mat4 rot_to_torque_mat;
uniform vec3 model_position;

void main() {
    // Actual vertex position has this super ancient but helpful function for us
    gl_Position = ftransform();

    // UV coordinates are also provided
    // uv = gl_MultiTexCoord0.st;
    uv = uv_shader;

    // Normal relative to worldspace, make sure to account for the model rotation
    normal_vector = mat3(inverse_model_mat) * normal;

    // Worldspace position of the vertex
    vert_position = model_position + (inverse_model_mat * gl_Vertex).xyz;
}