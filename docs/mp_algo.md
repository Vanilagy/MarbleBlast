# Multiplayer state synchronization protocol

## Part 1: The client

A game consists of a set of entities. Each player at all times holds what they think is the true state of each entity.

Players have the ability to advance the game, transitioning all entities from one state to the next. For most entities, advancing the game will not change their state, but for some, like the marble, it will.

After a player has advanced the game, they store all the states of the entities that have changed their state in that advancement. They also store the frame ID in which each state change occurred for later reference.

Additionally, if, during the advancement, an entity _E_ affected a different entity _F_ in some way, they store that relation in a graph by adding a directed edge from _E_ to _F_. Said graph has one node per entity.

During an advancement step, any entity can be tagged as an _ownership source_, marking itself as being _owned_ by the local player. At the end of each advancement step, each node tagged as owned will recursively pass this ownership to all of its adjacent nodes, resulting in complete subgraphs being owned.

Every 4 advancements or so, the player will send all stored state changes and their metadata (like the frame in which they occurred) to the server. Additionally, the edges of the graph will also be sent.

## Part 2: The server

Unlike most AAA games and unlike the clients, the server does not have the ability to advance the game state and relies on all the clients connected to the game to collectively do it. The server's main jobs are storing the game state it believes to be the most consistent, and updating said game state in a consistency-retaining manner whenever clients send updates.

Now, what does it mean for a state to be "consistent"? A consistent game state is one that can be reached by a sequence of advancement steps starting out from an initial state that we just define to be consistent. Each client, assuming their current state is consistent, keeps advancing their game state into the next state which we then also consider consistent. To make an example: On a client, it would be impossible for two separate marbles to pick up the same Power-Up at once - the simulation only allows for one player to pick it up. If however, the server somehow gets into the state of both (or neither!) players having the PowerUp - by incorrectly combining updates for both clients - that state can clearly be considered "inconsistent" as it would've been impossible to achieve on a single client. So the challenge of the whole algorithm is to ensure these states are impossible to achieve.

Some observations. Assume we receive two updates U_A and U_B from two clients A and B, and we combine their update graphs by merging the sets of edges. If there now is no way to get from an entity A updated to an entity B updated, we can safely merge both updates into the server's game state as the updates are concerned with a disjoint set of entities. If, however, the two graphs now suddenly become connected, we cannot guarantee state consistency were we to naively merge in both updates.

## Part 3: The fusion

The server keeps a list of all game entities. For each entity, it stores the last-received state update for each player, as well as the player that is currently said to *own* said entity. If an entity has an owner, the *true state* of that entity will be the state sent by the player who owns it. If an entity has no owner, the *true state* of that entity will be the most-recent state update received.

> What's the intuition behind an entity having no owner, you ask? Well, picture a non-player-controlled ball, rolling around a level, bouncing off walls but not interacting with any other marble. This ball is being simulated by all players, but not owned by any; therefore any player's state of this ball can be considered as the true state of the ball. Obviously, the most-recent state is also the most useful one, so we use that.

Now - assume we receive an update for a player P, including state updates and the graph of which entities affected which entities. We now loop over the set of changed entities in the update, skipping those that have already been merged into the server state:

For each changed entity E, we recursively define the set of *affecting entities* **A** as containing E, as well as all nodes in the set of changed entities that have an edge pointing **to** any element in **A**. The intuition is the following: If for any entity E there also exists an entity F with a edge F -> E, then E's state was influenced by F. Therefore, if we were to only merge E but not F into the server state, the merge would make no sense and could likely be inconsistent because E *needed* F to reach its current state. We are therefore also obligated to merge F into the server state. So: If we merge E, we also have to merge F to stay consistent. Or we don't merge either, which also keeps the state consistent as we don't change it.

Now - if (from the POV of the server) all of the entities in **A** have no owner or are owned by player P, we add the entities' state updates to all the server's entities. Additionally, we copy P's ownerships values to the entities as well. For this case, we're done.

If some of the entities in **A** are owned by a player that is not P, applying the update would mean we change entities that are currently not owned by us, which we are not allowed to do. We therefore discard the update of all entities in **A**.

## Part 4: The annoying details

We have now found a way to merge the client updates into the server state while keeping the server's state consistent. Our approach, however, is not yet complete.

### Multiple timelines and their problems
First, we need to observe the following: Technically, what we call "the server state" is not technically a game state in the sense that it captures the state of the game in any given moment - since we receive update packets in an inconsistent manner, the entities in the server state all have varying frame times in which they were last updated. The actual game state with all entities synced up can be reached by starting at the initial state (frame 0), applying all server-stored *true state* for frame 0, then advancing the simulation, then applying all server-stored *true state* for frame 1, then advancing again, and so on, until reaching the current *server frame#*, which the server increases automatically at a steady rate of (in our case) 120 Hz.

Each client maintains their own *client frame#*, always ahead of *server frame#* such that if each client were to send their current *client frame#* to the server, the received value is equal to or slightly ahead of *server frame#*. This effectively means that each client has to run ahead of the server by at least half the round-trip-time (RTT). We do this so that if two players P and Q update the same entity in the same frame, the updates will arrive at the server at roughly the same time. This means the server doesn't have to factor in any latency variations when merging in state.

Now: For any set of affecting entities **A** ready to be applied, if the maximum frame# of all state updates regarding entities in **A** is higher than *server frame#*, the set is entirely skipped and will be applied at a later server frame. This ensures that no state updates are ahead of the server time.

Conversely, we want to ensure that no updates that are way out of date are applied to the server state, as this would force all clients to rewind a very large distance to reconcile with the server's state. There are, however, some cases where applying "old" updates is fine - particularly on entities that rarely get updated, like PowerUps. If player P sends an update for a PowerUp that took place in frame 20, and the server is already in frame 50, but there haven't been any updates for said PowerUp, the update can be applied safely. The fact that *there haven't been any updates for the PowerUp sent by all of the other players* indicates that the PowerUp doesn't regularly change its state and therefore has no need for being simulated far into the future. Clients applying updates way in the past of their current frame will not rewind to that update, but simply apply it without simulating forward the consequences of said update. To best preserve consistency however, we require that the actual client sending the out-of-date update to the server is itself not in the past. We check this by making each client also send its *client frame#* whenever it sends an update packet. If this client frame is behind the server frame by a sufficiently large amount, we completely discard this update. An example for how this could play out: A client with a temporarily drop in internet connectivity picks up a PowerUp. It then comes back online and sends to the server a packet containing the update U. The server sees that the client frame# is not far behind the server's, so it applies the PowerUp's update even if it is old. We need to make an exception, though: If, for the given PowerUp, there has already been a newer state sent by somebody else, the update will be rejected if U's state for the PowerUp is too far behind the server state - and it will do this regardless of any ownership. Whenever an update gets rejected this way, the sending player will be notified to update their state of the entities on which the server update failed - only then will the server accept any updates from that player again.

### Forcing clients to update
Let's talk about how we can implement the behavior of rejecting updates from certain players regarding certain entities until they have applied the update we told them to apply. Each entity on the server is tagged with a mapping from player to an integer *version number*. For every player, this starts out as 0. Whenever something happens that revokes a player's "right" to update certain entities, we increment the version number for that player on that entity. The clients send their last-received version number alongside every update and if we detect that it's below the server's version number, we reject the update.

### Ownership shenanigans
We said earlier that any updates which would change an entity's ownership will automatically be rejected. This itself would be a super strict rule though, as it would mean any player who ever has ownership of anything will keep that ownership for the rest of the game. We therefore do two things: First of all, any player that is currently owning an entity can always revoke its ownership of it voluntarily. Additionally, the server automatically revokes ownership after a certain number of frames. A good number for this delay seems to be 8 frames, exactly double the expected delay between client packets. This means that as long as a client has a stable connection, they can perfectly retain their ownership of entities.

Now, let's assume a second player P comes along with an update that would change ownership of an entity E, owned by player Q != P. If the update is behind in any version numbers, we reject it, no questions asked. If it isn't, however, we simply add P's state updates to the list of state updates for that entity, but while retaining its current owner Q. If Q now loses its ownership (maybe it stopped sending packets), the server automatically declares P to be the new owner of this entity. It then increments the version number for Q for the entity it used to own, as well as all entities of P that caused this ownership change.

So, we can imagine an interaction like this as a *challenge*: Player P is challenging Q to defend its ownership ownership of E. If it fails, P will be crowned the new owner of this entity. Note that this should (probably?) be opt-in behavior for entities. Call it "challengeable". If an entity is not challengeable, any attempt to dethrone its owner will reject without question. Examples of challengeable entities could be marbles - the gameplay clock could be an example of a non-challengeable entity.

### UDP moment
Also, we need to address packet loss. If the client only ever sends a state update once and that update gets lost, we could risk having a state desync that never gets corrected. So I suggest this: For each entity, we store the history of state updates to that entity. I mean we do this anyway, but do it somewhere separately for networking purposes. So, an example would be:

> Update { frame: 20, state: ... }<br>Update { frame: 30, state: ... }<br>Update { frame: 40, state: ... }

30 times per second or so we now send this data to the server. What we send is the **latest** state update (so the one for frame 40 in this case), as well as the frame# of all state updates (in this case, [20, 30, 40]). The server will attempt to apply the latest state update but will take into consideration the earliest state update frame# to check if it would cause any merge conflicts.

We give each state update a unique, incremental ID. The server sends back the last ID it saw from the client and thus the client can discard all state updates with an ID equal to or less than what the server sent back. Conversely, when the server receives an update from the client, it will discard all state updates with an ID that it has already processed.

Making sure that server state updates arrive at the client works very similarly: Whenever the server adds a state change to its internal state, it numbers them according to its own incremental ID. When an update for a given entity is intended to be sent to a player, that update will be sent with every packet until the client acknowledges it. If that entity receives a more recent update, the old update will not be sent by the server anymore.

### Avoiding feedback loops
When receiving a state from the server, we apply that state to our local state if it wasn't originally sent by us (to avoid feedback loops). Additionally, if it wasn't sent by us, but we currently own the entity the update is concerned about, we also don't apply that update unless its version number is greater than ours. Why do we not apply some updates at all, one might ask? It's because in some cases, there's two different versions of the same entity living on the server and client. The server will send its version over, the client will send its version over, and then server and client simply swap their state - this will continue for often tens of seconds. We want to avoid this.

## Part 5: The algorithm

<!-- Since I'm usually super religious about this: The code is indented with spaces on purpose. It renders better than tabs. -->

Now that we've thought through how our state synchronization logic should work, let's pseudocode it.

### Client

First, let's describe how the clients store the data they send to the server:
```ts
type EntityUpdate = {
    updateId: number, // An incremental ID, unique for this client
    entityId: number, // The ID of the entity this update concerns
    frame: number, // The frame# in which the state change happened
    owner: number | null, // The ID the player who owns the entity
    challengeable: boolean, // Whether the owner of this entity can be challenged
    originator: number, // The ID of the player who sent this update
    version: number, // Decided by the server. Will be used to check if we need to apply an update

    state: EntityState // The actual state. Can be whatever, depends on the entity
};

type AffectionEdge = {
    from: number,
    to: number,
    frame: number
};

let entityUpdates: EntityUpdate[];
let affectionGraph: AffectionEdge[] = []; // *Directed* graph, Maps entity ID to entity ID
```

Then, let's look at what the client does to advance the game state.
```ts
let clientFrame = -1; // -1 so that it's 0 after the first advancement

function advance() {
    // ...

    simulate(); // During this step, we manually mark entity states as changed and manually add edges to the affection graph

    for (let entity of entities) {
        if (!entity.stateChanged) continue;

        let entityUpdate = entity.getLastUpdate();
        entityUpdates.push(entityUpdate);

        if (entity.ownedByUs) {
            // Flood the subgraph reachable from this node (= entity)
            propagateOwnershipToAdjacentNodesRecursively(entity);
        }
    }

    updateEntityHistory(); // This will create entity updates for all entities that changed state. This history is used for more than just networking; it's also used for generating replays and rewinding the simulation.

    clientFrame++;

    // ...
}
```

We need to send an update bundle to the server:
```ts
type ClientStateBundle = {
    currentClientFrame: number,
    entityUpdates: EntityUpdate[],
    affectionGraph: [number, number][]
};

// 30 Hz seems to be a good sweetspot
function onNetworkConnectionTick() {
    // ...

    // Here, we shallowly duplicate the entity updates and set `state` to `null` on an update if there's a later update for the same entity. This way we still send the server all of the frame# information, but we don't completely nuke bandwidth by sending tons and tons of state.
    let processedEntityUpdates = processEntityUpdates(entityUpdates);

    // Here, we turn the AffectionEdges into tuples, remove the frame# information and then remove any duplicate edges.
    let processedAffectionGraph = processAffectionGraph(affectionGraph);
    
    let bundle: ClientStateBundle = {
        currentClientFrame: clientFrame,
        entityUpdates: processedEntityUpdates,
        affectionGraph: processedAffectionGraph
    };

    connection.send(bundle, { reliable: false }); // We disable any default reliability layer built into our networking stack because we have our own reliability protocol for state updates.

    // ...
}
```

Whenever the server sends the client a state update, we need to act upon it:
```ts
type ServerStateUpdateMessage = {
    entityUpdates: EntityUpdate[],
    lastReceivedClientUpdateId: number,
    lastReceivedClientFrame: number,
    rewindToFrame: number // The frame we should rewind to in the next simulation
};

let lastServerStateUpdate: ServerStateUpdateMessage = null;
let queuedServerUpdates: EntityUpdate[] = [];
let lastReceivedSeverUpdateId = -1;

function onServerStateReceived(msg: ServerStateUpdateMessage) {
    // Filter out updates received by the server
    bundle.entityUpdates = bundle.entityUpdates.filter(update => {
        return update.updateId > msg.lastReceivedClientUpdateId;
    });

    // Filter out updates received by the client
    msg.entityUpdates = msg.entityUpdates.filter(update => {
        return update.updateId > lastReceivedServerUpdateId;
    });

    // Update this
    lastReceivedServerUpdateId = Math.max(
        lastReceivedServerUpdateId,
        ...msg.entityUpdates.map(update => update.updateId)
    );

    // Add them to a queue
    queuedServerUpdates.push(...msg.entityUpdates);

    // Remove old edges from the affection graph
    affectionGraph = affectionGraph.filter(edge => {
        return edge.frame > msg.lastReceivedClientFrame;
    });

    lastServerStateUpdate.msg = msg; // Store it for later
}
```

With this in place, we can now write the full update procedure for the client.
```ts
// Runs at about 120 Hz, or whatever rate necessary to be ahead of the server far enough
function update() {
    if (!lastServerStateUpdate) {
        advance();
        return;
    }

    let targetFrame = clientFrame;

    // This function rolls back the entire game state for all entities, including state update history and changes to the affection graph. This means that a history for all these things has to be stored.
    rollBack(lastServerStateUpdate.rewindToFrame);

    // Advance as many frames as necessary to catch back up
    while (clientFrame < targetFrame) {
        // Apply all server state updates
        for (let update of queuedServerUpdates) {
            if (update.frame === clientFrame) {
                applyServerUpdateToEntity(update);
            }
        }

        advance();
    }

    advance(); // Advance one more time so we actually end up one frame ahead of where we were before
}
```

How do we apply server updates to entities?
```ts
function applyServerUpdateToEntity(update) {
    let entity = getEntityById(update.entityId);
    let localUpdate = entity.getLastUpdate();

    let us = getLocalPlayerId();
    let shouldApplyState = update.originator !== us
        && (entity.owner !== us || update.version > localUpdate.version);

    if (shouldApplyState) {
        // We don't need to apply the state when certain conditions are met (to avoid feedback loops)
        entity.applyState(update.state);
    }
}
```

Alright, that does it for the client. Now, let's take a look at the server.

### Server
Let's first talk about how the server stores game state. The server is stupid in the sense that it doesn't know about the game the players are playing at all, at least initially. It doesn't parse the .mis file, it doesn't create a scene graph, nothing like that. It relies on the clients for telling it both when entities change and, even more primitively, that they *exist*. To the server, an entity is nothing but a number (its ID) mapped to a bag of state updates and a bit of extra info.
```ts
type Entity = {
    updates: EntityUpdate[], // This array contains updates from multiple different players. We make sure this array stays sorted by frame# for relatively fast lookups.
    owner: number | null
};

let entities = new Map<number, Entity>();

function getEntityById(id: number): Entity {
    if (entities.has(id)) return entities.get(id);

    // Create a new entity entry
    let entity: Entity = {
        updates: [],
        owner: null
    };
    entities.set(id, entity);

    return entity;
}
```

For entities connected by the affection graph we want to ensure that their updates are applied together. We therefore introduce the concept of an "update group":
```ts
type UpdateGroup = {
    player: Player, // The player who sent the updates of this group
    entityIds: number[], // All of the entities that have an update in this group
    entityUpdates: EntityUpdate[]
};

let queuedUpdateGroups: UpdateGroup[] = [];
```

Some utility functions for groups are needed:
```ts
function getEarliestUpdateForEntityId(group: UpdateGroup, entityId: number): EntityUpdate {
    return group.entityUpdates.filter(update => update.entityId === entityId)
        .sort((a, b) => a.frame - b.frame)[0];
}

function getLatestUpdateForEntityId(group: UpdateGroup, entityId: number): EntityUpdate {
    return group.entityUpdates.filter(update => update.entityId === entityId)
        .sort((a, b) => b.frame - a.frame)[0];
}
```

When we receive a state update bundle from the client, we create these groups:
```ts
function onClientStateReceived(player: Player, msg: ClientStateBundle) {
    // Filter out updates received by the server
    msg.entityUpdates = msg.entityUpdates.filter(update => {
        return update.updateId > player.lastReceivedClientUpdateId;
    });

    for (let entity of getEntityIds(msg.entityUpdates)) {
        // We recursively get all the nodes (= entities) that have an edge pointing towards any of the nodes already in the set, starting with the set containing only `entity`.
        let affecting: number[] = getAffectingSubgraph(entity, msg.affectionGraph);

        // Get all the updates regarding those entities
        let updates = msg.entityUpdates.map(update => affecting.includes(update.entityId));

        let newGroup: UpdateGroup = {
            player: player,
            entityIds: affecting,
            entityUpdates: updates
        };

        // Check if we've already queued an update group before with the **exact same** entities. If so, replace the old one with the new one!
        let existingGroup = getUpdateGroupWithIdenticalEntities(affecting);
        if (existingGroup) {
            replaceUpdateGroup(existingGroup, newGroup);
        } else {
            queuedUpdateGroups.push(newGroup);
        }
    }
}
```

We also need a few utility functions for update groups:
```ts
/** For a given update group, returns the maximum of all the frame# of all of its updates. */
declare function getMaxFrame(group: UpdateGroup): number;
```

Let's take a look at the main update loop of the server:
```ts
let serverFrame = -1;

// Runs at a constant rate of 120 Hz.
function update() {
    serverFrame++;

    for (let group of queuedUpdateGroups) {
        if (getMaxFrame(group) > serverFrame) continue; // Lata bitch

        if (isApplicationLegal(group)) {
            applyUpdateGroup(group);
        } else {
            rejectUpdateGroup(group);
            queuedUpdateGroups.delete(group);
        }
    }
}
```

```ts
const TWICE_CLIENT_UPDATE_PERIOD = 2 * 4;

function isApplicationLegal(group: UpdateGroup): boolean {
    for (let id of group.entityIds) {
        let entity = getEntityById(id);
        let lastStoredUpdate = entity.updates.at(-1);
        let lastCandidateUpdate = getLatestUpdateForEntityId(group, id);

        if (lastStoredUpdate) {
            let earliestCandidateUpdate = getEarliestUpdateForEntityId(group, id);

            if (lastUpdate.frame >= earliestCandidateUpdate.frame) {
                if (serverFrame - earliestCandidateUpdate.frame > TWICE_CLIENT_UPDATE_PERIOD)
                    return false;
            }

            if (lastStoredUpdate.version > lastCandidateUpdate.version)
                return false;
            
            outer:
            if (entity.owner !== null) {
                let ownerUpdate = entity.updates.findLast(update => update.originator === entity.owner);

                if (serverFrame - ownerUpdate.frame > TWICE_CLIENT_UPDATE_PERIOD)
                    break outer;

                let isChallengable = lastStoredUpdate.challengable;
                if (!isChallengable && lastCandidateUpdate.owner !== entity.owner)
                    return false;
            }
        }
    }

    return true;
}
```

```ts
function applyUpdateGroup(group: UpdateGroup) {

}
```