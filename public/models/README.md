# Optional models

Each of the four parts of the scene can be replaced by a `.glb` (glTF 2.0, Draco-compressed is fine — the decoder is
in `public/draco/`). Anything missing or failing to load silently keeps the procedural version (one console warning).

Enable a slot by editing `models.json`:

```json
{ "school": "school.glb", "classroom": null, "teacher": "teacher.glb", "students": null }
```

An entry may also be `{ "url": "school.glb", "position": [0,0,0], "rotationY": 0, "scale": 1 }` to nudge a model into place.
The camera path never changes, so models are authored **to the scene's coordinates** — metres, +Y up, school entrance at
the origin facing +Z, and the classroom interior spanning x 2.3…14, z −12.7…−0.3 (the corridor runs along x −1.6…2.0).

| Slot | Replaces | Authoring notes |
|---|---|---|
| `school` | Building shell: facade, fins, canopy, sign, partition/corridor walls | Leave the entrance and the interior volume open. Campus (ground, trees, paths, walkers) stays procedural. |
| `classroom` | Corridor + classroom finishes: floors, ceilings, desks, chairs, shelves, posters, fans, board frame | Optional mesh named `PC_Screen` (UVs 0–1, glTF orientation) receives the live smartboard. Without it, the procedural screen at x≈13.9, y 1.0–2.8 is kept. |
| `teacher` | Procedural teacher | Origin at floor level, facing +Z. The engine turns it toward the board. If the file has animations, the clip named `*idle*` (or the first) plays. Otherwise optional pivots `PC_ArmR`/`PC_ArmL` (+ `PC_ElbowR`/`PC_ElbowL`) are posed — arms must hang along −Y with identity rotation at rest. |
| `students` | All 23 seated students and the foreground student | **One** seated student: origin on the floor under the seat centre, facing +Z (rotated to face the board; cloned per seat, skinned meshes supported). Optional node `PC_Head` gets a subtle sway; an idle clip is looped with per-student offset. |

The walking students outside always stay procedural. Embedded lights in a `.glb` are ignored (the scene has its own
rig); shadows are enabled on all meshes. Light shafts and dust are always procedural and sit at the window positions.
