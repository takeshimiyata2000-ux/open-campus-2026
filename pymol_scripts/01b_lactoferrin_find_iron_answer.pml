# Mission 1B: Answer reveal for lactoferrin iron atoms
# Run after opening 1BLF normally or after Mission 1A.
# This script does not reload the structure. It reveals the answer in the
# currently open model.

select iron_atoms, elem Fe
remove not polymer.protein and not iron_atoms

hide everything
show cartoon, polymer.protein
show dots, polymer.protein
color white, polymer.protein
set cartoon_transparency, 0.00
set dot_width, 2
set dot_density, 2

show spheres, iron_atoms
color orange, iron_atoms
set sphere_scale, 1.00, iron_atoms

set label_size, 24
label iron_atoms, "Fe"

zoom iron_atoms, 8
orient iron_atoms
deselect

python
print("")
print("MISSION 1B: ANSWER")
print("正解: Feと表示されたオレンジ色の原子が鉄です。")
print("白: ラクトフェリン本体のcartoonとdot状surface")
print("ラクトフェリンは、特定の場所で鉄をつかむタンパク質です。")
print("")
python end
