// This file is a faster way to bundle the project, but will throw much less TypeScript errors. Good for repetetive iterative work, but not good for being 100% type-correct. It's for debug, basically.

import factory from './rollup-base.config';
import typescript from 'rollup-plugin-typescript';

export default factory(typescript);
