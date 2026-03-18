---

osmosis-styles:

  theme: Default

---

## ideas

- [x] Replace Gear icon with paint icon
- [x]  Fit images inside sequential review modal
- [x] cloze deletions inside code blocks using comments in inspo.md
- [x] Colored buttons 
- [x] Reset style buttons should refresh the mind map.  Currently have to manually press the refresh button for changes to revert 
- [x] Map direction + Map Balance
	- [x] Direction: up, down, left, right
	- [x] Balance: one side, both sides
		- [x] If one side, pick which side
- [x] Indent/outdent should update to match the map direction and balance to be intuitive to the layout of the map.  For example, if the map direction is horizontal and a node is on the left side, Alt+left arrow would indent the node, not outdent.  This is in contrast to Alt+left outdenting nodes on the right side of the map.  The same principle should be applied to vertical vertical direction.   Arrow key and ribbon buttons should adapt to the selected node's position and map layout. 
- [ ] Add radial map style
- [x] Mind map right click context menu!
- [x] Add "Mind map view" to each note's ellipsis/More options menu
- [ ] Get rid of incoming line to root node
- [x] Fix up and down maps
- [x] Add more branch styles
	- Thick to thin curved
- [ ] Exclude headings (if so what level?) from study mode in mind map
- [x] Change "Format" to "Node" and replace map name with "Map Styling".  Active menu should be filled solid, 
- [ ] Promote/demote save custom theme to map so mind maps are portable if sharing (v0.2)
- [ ] show card stats in note edit mode and mind map mode (how long until I'll study this again?)
- [ ] show a calendar heatmap of cards when they're due
- [ ] Support transclusion titles (Add settings)
	- [ ] Fileneame as h1 branch node 
	- [ ] `title` frontmatter fields as h1 branch node
	- [ ] Add option to ignore h1 headings if picking either of these two
- [ ] Fixed imbalanced gap between root node for left/right (+ maybe up/down) maps
	- ![](Pasted%20image%2020260316060950.png)
- [ ] `Ctrl+Shift+[` (all four fold operators don't work for transcluded maps)
- [ ] Format button should toggle panel visibility (doesn't close currently) ![](Pasted%20image%2020260316061016.png)
- [ ] Blockquote new lines should be considered one node ![](Pasted%20image%2020260316061036.png)
- [ ] Callout new lines should be one node
	- ![](Pasted%20image%2020260316061049.png)
- Settings > Default Theme (which will drive what each mind map will look like when opening)
- Settings > Expand or collapse transcluded notes by default.  It's annoying to have to expand every time
- Settings > Remember folding (when opening a map again, should it remember which branches were folded/unfolded?)
- Map should balance transcluded notes as well ![](Pasted%20image%2020260316061116.png)
- Default/shipped themes shouldn't the Map > Layout
- "Sort branches by frontmatter field" - Would be nice because I have to add 2.1.1 as file prefixes right now
- Support transclusion for notes with spaces and characters in titles
- Do cloze deletions work in side of tables?
- Scroll to zoom in and out, Ctrl to pan-scroll - because it's not a linear/sequential experience.  Plus, when using Three.js or another library for the 3D mind map, we'll want scroll to dolly anyway.
- Show answer button bottom is getting cut off 
	- ![](Pasted%20image%2020260316061130.png)
- Maybe explore [jupymd](https://github.com/d-eniz/jupymd?tab=readme-ov-file) and see how to integrate that into Osmosis as a "code type-in" flashcard? 
- Flashcard Dashboard doesn't update until `Reload app without saving` or restarting Obsidian
- Multiple choice cards (to replicate CodeCademy quizzes)
- Show colored card review counts overtop of folders in the Outliner?  Could be really intuitive for those who organize their decks to match their notes.  Right click on a folder or a note and select "Study flashcards"
- Can the came card be assigned to multiple decks?  Lots of cross-discipline content exists.  
- Auto-indent decks based on folder structure if cards are not explicitly assigned to a deck via code fence metadata or note frontmatter? ![](Pasted%20image%2020260316061147.png)
- Show mini-mind map of current flashcard in front and/or back of card in sequential review window?
- Support dataview and bases rendering in nodes. 
- Opening another note from a mind map and then going back doesn't show the mind map.  Also not possible to recover the note view by clicking the note view icon.
- have an "Edit card" and "open note" icon in sequential review
- "Show breadcrumbs" toggle for sequential review (show deck and or parent folders/note)
- Use Excalidraw for image occlusion?
- Show ordered list notations inside a node.  Automatically creat a new list item and make the cursor at the end when going into to edit the node?
- [x] Doesn't Anki show cards you have a hard time remembering more frequently in a given study session?  Shouldn't our sessions be continuous until a user answers "Easy" for all of the cards of the selected deck to study?  For example, if I answered "Again" for card 1, then study a few more cards, wouldn't it then show it to me card 1 again in the same session as the 5th or 6th card or something like that?  Or does FSRS work differently?
- iOS admonitions and other nodes are ghosting in mind map view, where the node content is frozen/stuck at its originally rendered location when mind map is loaded.  When the map is panned/zoomed, the content stays in the same position. 
- Are there any other features of FSRS like 'learning_steps' that we haven't implemented but should?
- Disable card button in review (Anki equivalent?)
	- disabled: true