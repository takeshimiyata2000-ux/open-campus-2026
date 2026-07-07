# Mission 2: Cholera toxin subunits
# Run in PyMOL: File > Run Script...

reinitialize
set fetch_path, /Users/takeshi/Documents/オープンキャンパス2026/pdb_cache
fetch 1xtc, cholera_toxin, async=0

hide everything
remove solvent
show cartoon, cholera_toxin
bg_color white
set ray_opaque_background, off

# Chain naming can vary across structures. This script starts with a common A/B5 style view.
color red, chain A
color cyan, not chain A

show surface, cholera_toxin
set transparency, 0.35, cholera_toxin
show cartoon, cholera_toxin

select active_subunit, chain A
select binding_subunits, not chain A

color red, active_subunit
color deepteal, binding_subunits
deselect

zoom cholera_toxin, 8
orient cholera_toxin
set label_size, 20

python
print("")
print("MISSION 2")
print("毒素は、どの部分を使って細胞にくっつく？")
print("赤: 細胞内で働く側として説明する部分")
print("青緑: 細胞表面への結合に関わる側として説明する部分")
print("Bサブユニットが輪のように並ぶところを観察してください。")
print("")
python end
