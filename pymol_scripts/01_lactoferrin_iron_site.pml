# Mission 1: Lactoferrin iron-binding site
# Run in PyMOL: File > Run Script...

reinitialize
set fetch_path, /Users/takeshi/Documents/オープンキャンパス2026/pdb_cache
fetch 1blf, lactoferrin, async=0

hide everything
remove solvent
show cartoon, lactoferrin
color gray80, lactoferrin
set cartoon_transparency, 0.15
set ray_opaque_background, off
bg_color white

# Iron atoms are the visual target for visitors.
select iron_atoms, lactoferrin and elem Fe
show spheres, iron_atoms
color orange, iron_atoms
set sphere_scale, 0.65, iron_atoms

# Robust selection: highlight residues close to iron without relying on residue numbers.
select iron_site_residues, byres (lactoferrin within 4.0 of iron_atoms)
show sticks, iron_site_residues
color yellow, iron_site_residues

# Add a second shell to make the binding pocket easier to see.
select nearby_residues, byres (lactoferrin within 7.0 of iron_atoms) and not iron_site_residues
show sticks, nearby_residues
color marine, nearby_residues

zoom iron_atoms, 12
orient iron_atoms
set label_size, 24
label iron_atoms, "Fe"
deselect

python
print("")
print("MISSION 1")
print("このタンパク質は、どこで鉄をつかんでいる？")
print("オレンジ色: 鉄原子")
print("黄色: 鉄のすぐ近くにあるアミノ酸")
print("青色: 鉄結合部位を囲む周辺アミノ酸")
print("")
python end

# Keep the final view centered even after interactive camera changes.
zoom iron_atoms, 8
orient iron_atoms
