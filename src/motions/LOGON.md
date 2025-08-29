ca (change around) can delete the around text and create two cursors one at each "bracket" or around object

Flip the motion on its head.
Instead of doign 2di(
We can instead just do
di2(
Same number of strokes.

BUG:

There is a bug

```
{
  "key": "v i",
  "command": "vstoys.motions.vi",
  "when": "editorTextFocus && hyper-layer"
|},
```

if you stand the cursor at the pipe and do `"di{"` or `"di}"` it will not work.
