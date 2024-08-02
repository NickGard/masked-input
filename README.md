# masked-input

Masked-input is a _visual-only_ enhancement to native `input` elements. It adds several new attributes and properties to the element to define a mask and its behavior. As a visual-only enhancement, it does not interfere with the normal operation of `input` elements. Calling `event.preventDefault()` on the `beforeinput` event still prevents inputs from recieving a new character and stops the `input` event from dispatching. Form validation still works on the user-typed value (not the displayed masked value). Copying from the input only writes the user-typed value (or the portion that's selected) to the clipboard, not the displayed masked value. Querying the `input`'s value also returns the user-typed value. The displayed value can be retrieved with the new `maskedValue` read-only property.

## API

Masked-input is built on top of native inputs and supports the entirety of the native API. In addition, these attributes and properties have been added:

`mask-pattern` / `maskPattern`: defines the pattern to use to mask the input's value. The pattern is a string of characters that will be shown when the input has a value, with the characters (graphemes) of the value replacing the placeholder character, `_` (underscore). The placeholder character can be changed via the `mask-replacement-character` attribute or its corresponding `maskReplacementCharacter` property. When the number of characters in the value are greater than the number of placeholders, the mask will be removed and the value will be shown in its entirety. **If you wish to "cut off" the input's value to match the mask, use the `maxlength` attribute or the `max` attribute for `number` type inputs.** Unfilled placeholders are replaced with ` ` (an empty string) unless the `show-replacement-characters` attribute is set. Empty inputs do not display the mask unless the `show-empty-mask` attribute is set.

`maskedValue`: a read-only property that returns the current value with the mask and all current mask options applied. Attempting to set a value will raise a `DOMException` (`"NotSupportedError"`).

`mask-replacement-character` / `maskReplacementCharacter`: defines the character to use as the placeholder in the mask pattern. Defaults to `_` (underscore).

`show-empty-mask`: a boolean attribute to show the mask when the input has no value.

`show-overflowed-mask`: a boolean attribute to continue displaying the mask when the value has exceeded the number of placeholders.

`show-replacement-characters`: a boolean attribute to display the replacement characters instead of an emptry string for unused placeholders.

## Copy / Paste

The portion of the value that is selected will be copied _without_ the mask. Only the actual unmasked value of the input can be copied. Pasting will apply the mask to whatever value is inserted, regardless of whether the user thinks the value in their clipboard is already formatted. For instance, with the following setup, pasting "(999) 555-1234" will result in the masked value appearing as "((99) 9)5-551234.

```html
<input
  type="tel"
  is="masked-input"
  mask-pattern="(___) ___-____"
  show-overflowed-mask
/>
```

## Datalist / Combobox

Most inputs can be turned into a Combobox by associating a `<datalist>` element with the `list` attribute.

```html
<input is="masked-input" list="people" />
<datalist id="people">
  <option>Oscar</option>
  <option>Bert</option>
  <option>Ernie</option>
</datalist>
```

Masked-input works with these with the following restrictions:

- `option` values are not formatted in the user-agent dropdown. (The value _is_ formatted once it is selected and becomes the input's value)
- `number` input type comboboxes do not work with up/down arrow key presses. The arrow key presses invoke the `stepUp()` and `stepDown()` methods instead. Mouse interaction with the combobox still works. (Browsers also differ widely on arrow key behavior for native number input comboboxes.)
