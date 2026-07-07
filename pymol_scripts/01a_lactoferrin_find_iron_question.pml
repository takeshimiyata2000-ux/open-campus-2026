# Mission 1A: Open normal lactoferrin structure and find iron atoms
# Run in PyMOL: File > Run Script...
#
# Visitor task:
#   Rotate the ordinary 1BLF structure and decide which atoms are iron.

reinitialize
set fetch_path, /Users/takeshi/Documents/オープンキャンパス2026/pdb_cache
fetch 1blf, lactoferrin, async=0

# Show the protein as a white molecular surface with a clipped slab. This
# avoids relying on mouse-wheel clipping, which varies by PyMOL/input device.
hide everything
remove solvent
show surface, polymer.protein
color white, polymer.protein
set transparency, 0.00, polymer.protein
set surface_quality, 1
select small_atoms, lactoferrin and not polymer.protein
show spheres, small_atoms
color gray60, small_atoms
set sphere_scale, 0.35, small_atoms
set ray_opaque_background, off
bg_color black

zoom lactoferrin, 8
orient lactoferrin
clip slab, 35
deselect

python
print("")
print("MISSION 1A")
print("1BLFの白い表面の断面を見ながら、鉄がどこにあるか探してみよう。")
print("ヒント: 分子を回転させて、内側に見える小さい原子を探します。")
print("答え合わせ: 01b_lactoferrin_find_iron_answer.pml")
print("")
python end
