# Template: highlight specific amino acids manually
# Replace object name, chain, and residue numbers after choosing a final PDB.

# Example:
# load your_structure.pdb, target
# select important_residues, target and chain A and resi 45+87+130
# show sticks, important_residues
# color yellow, important_residues
# zoom important_residues, 10

hide everything
show cartoon, all
color gray80, all
bg_color white

# Edit this line for the final structure.
select important_residues, chain A and resi 45+87+130

show sticks, important_residues
color yellow, important_residues
set stick_radius, 0.18, important_residues
zoom important_residues, 10

python
print("")
print("MANUAL HIGHLIGHT TEMPLATE")
print("指定したアミノ酸を黄色に変えるテンプレートです。")
print("chain A and resi 45+87+130 の部分を、使う構造に合わせて変えてください。")
print("")
python end
