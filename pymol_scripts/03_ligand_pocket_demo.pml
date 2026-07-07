# Mission 3: Ligand-binding pocket demo
# Run in PyMOL: File > Run Script...
#
# Default example uses a protein-ligand complex. You can replace the PDB ID
# with a structure closer to your research theme after choosing the final target.

reinitialize
set fetch_path, /Users/takeshi/Documents/オープンキャンパス2026/pdb_cache
fetch 1err, pocket_demo, async=0

hide everything
remove solvent
bg_color white
set ray_opaque_background, off

# Split one protein chain and its bound small molecule.
select protein_part, polymer.protein and chain A
select ligand_part, organic and not polymer and chain A

show cartoon, protein_part
color gray80, protein_part
show surface, protein_part
set transparency, 0.45, protein_part

show sticks, ligand_part
color magenta, ligand_part
set stick_radius, 0.22, ligand_part

# Highlight residues forming the pocket around the ligand.
select pocket_residues, byres (protein_part within 4.0 of ligand_part)
show sticks, pocket_residues
color yellow, pocket_residues
set stick_radius, 0.16, pocket_residues

zoom ligand_part, 10
orient ligand_part
deselect

python
print("")
print("MISSION 3")
print("小さな分子は、タンパク質のどこに入っている？")
print("ピンク: タンパク質に結合した小さな分子")
print("黄色: その分子を囲むアミノ酸")
print("この黄色の場所が、薬や食品成分が働くヒントになります。")
print("")
python end
