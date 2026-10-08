# Gate model assets

The builder loads the supplied STL models for `single`, `ladder`, `flag`, and `hurdle`. It normalizes their source axes and size when loading them, then gives them a white body with blue structural accents. The single and ladder openings receive inset LED strips; the flag gets an LED strip on its pole. The builder's LED color control recolors those lights.

The `corkscrew` and `dive` slots can use GLB files with those names. GLB models should use Y-up, face forward along +Z, and put their origin at the center of the ground contact point. If a model is missing, the editor shows its built-in preview geometry.
