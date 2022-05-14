import { EntityState } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { BallCollisionShape, CollisionShape } from "../physics/collision_shape";
import { RigidBody } from "../physics/rigid_body";
import { Geometry } from "../rendering/geometry";
import { Material } from "../rendering/material";
import { Mesh } from "../rendering/mesh";
import { ResourceManager } from "../resources";
import { Entity } from "./entity";
import { Game } from "./game";

type BalloonState = EntityState & { entityType: 'balloon' };

export class Balloon extends Entity {
	body: RigidBody;
	shape: CollisionShape;
	mesh: Mesh;

	constructor(game: Game, id: number) {
		super(game);
		this.id = id;

		this.body = new RigidBody();
		this.body.evaluationOrder = this.id;
		this.body.gravity.set(0, 0, -5);
		this.shape = new BallCollisionShape(1);
		this.shape.mass = 0.2;
		this.shape.restitution = 0.5;
		this.body.addCollisionShape(this.shape);

		let material = new Material();
		material.transparent = true;
		material.opacity = 0.75;
		this.mesh = new Mesh(Geometry.createSphereGeometry(1, 64, 64), [material]);

		game.renderer.scene.add(this.mesh);
		game.simulator.world.add(this.body);

		this.body.position.set(0, -13.5, 0);
	}

	async init() {
		let tex = await ResourceManager.getTexture("interiors/edge_warm2.jpg");
		this.mesh.materials[0].diffuseMap = tex;
	}

	update() {
		this.stateNeedsStore = true;
		this.body.angularVelocity.multiplyScalar(0.995);

		for (let collision of this.body.collisions) {
			let shapes = [collision.s1, collision.s2];
			if (!shapes.includes(this.shape)) continue;
			if (shapes[0] !== this.shape) shapes.reverse();
			if (!(shapes[1] instanceof BallCollisionShape)) continue;
			if (!(shapes[1].body.userData instanceof Marble)) continue;

			let marble = shapes[1].body.userData as Marble;
			this.affect(marble);
			marble.affect(this);
		}
	}

	render() {
		this.mesh.position.copy(this.body.position);
		this.mesh.orientation.copy(this.body.orientation);
		this.mesh.recomputeTransform();
	}

	getState(): BalloonState {
		return {
			entityType: 'balloon',
			position: this.body.position.clone(),
			orientation: this.body.orientation.clone(),
			linearVelocity: this.body.linearVelocity.clone(),
			angularVelocity: this.body.angularVelocity.clone()
		};
	}

	getInitialState(): BalloonState {
		return {
			entityType: 'balloon',
			position: this.body.position.clone(),
			orientation: this.body.orientation.clone(),
			linearVelocity: this.body.linearVelocity.clone(),
			angularVelocity: this.body.angularVelocity.clone()
		};
	}

	loadState(state: BalloonState) {
		this.body.position.fromObject(state.position);
		this.body.orientation.fromObject(state.orientation);
		this.body.linearVelocity.fromObject(state.linearVelocity);
		this.body.angularVelocity.fromObject(state.angularVelocity);
	}
}