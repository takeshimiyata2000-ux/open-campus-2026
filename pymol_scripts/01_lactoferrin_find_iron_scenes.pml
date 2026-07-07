# Mission 1: Lactoferrin find-and-reveal using PyMOL scenes
# Run once, then switch scenes from the Scenes panel:
#   question -> answer

reinitialize
set fetch_path, /Users/takeshi/Documents/オープンキャンパス2026/pdb_cache
fetch 1blf, lactoferrin, async=0

hide everything
remove solvent
bg_color black
set ray_opaque_background, off

# Scene 1: question
show surface, polymer.protein
color white, polymer.protein
set transparency, 0.00, polymer.protein
set surface_quality, 1
select small_atoms, lactoferrin and not polymer.protein
show spheres, small_atoms
color gray60, small_atoms
set sphere_scale, 0.35, small_atoms
zoom lactoferrin, 8
orient lactoferrin
clip slab, 35
deselect
scene question, store

# Scene 2: answer
hide everything
show dots, polymer.protein
color white, polymer.protein
set dot_width, 2
set dot_density, 2
select iron_atoms, lactoferrin and elem Fe
show spheres, iron_atoms
color orange, iron_atoms
set sphere_scale, 1.00, iron_atoms
set label_size, 24
label iron_atoms, "Fe"
zoom iron_atoms, 8
orient iron_atoms
deselect
scene answer, store

scene question, recall

python
print("")
print("MISSION 1: SCENES")
print("question scene: 鉄を探す画面")
print("answer scene: Feラベルと周辺アミノ酸を表示する答え合わせ")
print("PyMOL右上の Scenes から question / answer を切り替えます。")
print("")
python end
