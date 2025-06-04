class MaskedInput extends HTMLInputElement {
  static observedAttributes = [
    "mask-pattern",
    "mask-replacement-character",
    "show-empty-mask",
    "show-overflowed-mask",
    "show-replacement-characters",
    "type",
    "value",
    "pattern",
    "required",
    "maxlength",
    "minlength",
    "step",
    "min",
    "max",
    "dir",
  ];
  // TODO: progressive-reveal="pairwise leading|following"

  #unmaskedValue = "";
  #maskedValue = "";
  #mask = "";
  #maskReplacementCharacter = "_";
  #passwordChar = "•";
  #replacementSlots = 0;
  #valueCharacterCount = 0;
  #characterSlots = [];
  #isValueReflected = true;
  static #maskableTypes = [
    "text",
    "url",
    "search",
    "tel",
    "email",
    "password",
    "number",
  ];
  #internalType = "text";
  #isInternalTypeCalibration = false;

  get maskReplacementCharacter() {
    return this.#maskReplacementCharacter;
  }
  set maskReplacementCharacter(c) {
    this.#maskReplacementCharacter = String(c);
    this.#applyMask();
  }

  get maskPattern() {
    return this.#mask;
  }
  set maskPattern(mask) {
    this.#mask = String(mask);
    this.#applyMask();
  }

  get maskedValue() {
    return this.#getMaskVisibility()
      ? this.#maskedValue
      : this.#characterSlots
          .slice(0, this.#valueCharacterCount)
          .map(({ displayChar }) => displayChar)
          .filter(Boolean)
          .join("");
  }
  set maskedValue(v) {
    throw new DOMException("maskedValue is readonly", "NotSupportedError");
  }

  get value() {
    return this.#unmaskedValue;
  }
  set value(value) {
    // stop reflecting the attribute once the value is set programatically
    this.#isValueReflected = false;
    // do not limit the value to maxlength when set programatically
    this.#unmaskedValue = String(value);

    // set validity
    this.#setValidity();

    this.#applyMask();
  }

  get valueAsNumber() {
    return this.#getNativeInput().valueAsNumber;
  }
  set valueAsNumber(value) {
    const nativeInput = this.#getNativeInput();

    // this will throw if an invalid value set or if the input is non-numeric type
    nativeInput.valueAsNumber = value;

    this.#setValue(nativeInput.value);
    this.#applyMask();
  }

  get type() {
    return this.#internalType;
  }
  set type(type) {
    if (!MaskedInput.#maskableTypes.includes(type)) {
      throw new DOMException(
        `Cannot set type to ${type}. Masked-input type can only be one of [${MaskedInput.#maskableTypes.join(
          ", "
        )}].`,
        "NotSupportedError"
      );
    }

    this.#internalType = type;

    if (super.type !== "text") {
      super.type = "text";
    }

    // show the correct soft keyboard for the input type
    super.inputMode =
      this.inputMode ||
      (type === "password" ? "text" : type === "number" ? "decimal" : type);

    this.#setValidity();
  }

  get validity() {
    return this.#getNativeInput().validity;
  }
  set validity(v) {}

  get dir() {
    return super.dir;
  }
  set dir(direction) {
    if (super.dir !== direction) {
      super.dir = direction;
      this.#applyMask();
    }
  }

  select() {
    this.#trySetSelectionRange(
      this.#characterSlots.at(0)?.start ?? 0,
      this.#getEndPosition(),
      this.selectionDirection
    );
  }

  setRangeText = (
    replacement,
    start = this.selectionStart,
    end = this.selectionEnd,
    selectMode = "preserve"
  ) => {
    if (replacement == null) {
      throw new TypeError(
        "Failed to execute 'setRangeText' on 'HTMLInputElement': 1 argument required, but only 0 present."
      );
    }

    this.#trySetSelectionRange(start, end, this.selectionDirection);
    const { charIndexBeforeSelection } = this.#getSelectionPosition();
    this.#insertText(replacement);

    switch (selectMode) {
      case "select": {
        const newEnd = this.#getPositionOfCharAtIndex(
          (charIndexBeforeSelection || 0) +
            MaskedInput.#toGraphemes(replacement).length
        )?.end;
        this.#trySetSelectionRange(start, newEnd, this.selectionDirection);
        break;
      }
      case "start": {
        this.#trySetSelectionRange(start, start, this.selectionDirection);
        break;
      }
      case "end": {
        const newEnd = this.#getPositionOfCharAtIndex(
          (charIndexBeforeSelection || 0) +
            MaskedInput.#toGraphemes(replacement).length
        )?.end;
        this.#trySetSelectionRange(newEnd, newEnd, this.selectionDirection);
        break;
      }
      default: {
        // "preserve" is the default
        this.#trySetSelectionRange(start, end, this.selectionDirection);
        break;
      }
    }
  };

  stepUp = (stepIncrement) => {
    const nativeInput = this.#getNativeInput();
    nativeInput.stepUp(stepIncrement);
    this.#setValue(nativeInput.value);
    this.#applyMask();
  };

  stepDown = (stepIncrement) => {
    const nativeInput = this.#getNativeInput();
    nativeInput.stepDown(stepIncrement);
    this.#setValue(nativeInput.value);
    this.#applyMask();
  };

  checkValidity = () => {
    return this.#getNativeInput().checkValidity();
  };

  getAttribute = (name) => {
    if (name === "type") {
      return this.#internalType;
    } else {
      return this.attributes[name]?.value ?? null;
    }
  };

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "mask-pattern": {
        this.#mask = newValue;
        this.#applyMask();
        break;
      }

      case "mask-replacement-character": {
        this.#maskReplacementCharacter = newValue;
        this.#applyMask();
        break;
      }

      case "type": {
        if (!MaskedInput.#maskableTypes.includes(newValue)) {
          throw new DOMException(
            `Cannot set type to ${newValue}. Masked-input type can only be one of [${MaskedInput.#maskableTypes.join(
              ", "
            )}].`,
            "NotSupportedError"
          );
        }

        if (this.#isInternalTypeCalibration) {
          // super.type = "text" triggers a reflow that we should ignore
          this.#isInternalTypeCalibration = false;
          break;
        }

        this.#internalType = newValue;

        if (super.type !== "text") {
          this.#isInternalTypeCalibration = true;
          super.type = "text";
        }

        // show the correct soft keyboard for the input type
        super.inputMode =
          this.inputMode ||
          (newValue === "password"
            ? "text"
            : newValue === "number"
            ? "decimal"
            : newValue);

        // validate
        this.#setValidity();
        break;
      }

      case "show-empty-mask":
      case "show-overflowed-mask":
      case "show-replacement-characters": {
        this.#applyMask();
        break;
      }

      case "value": {
        if (this.#isValueReflected && newValue !== this.#unmaskedValue) {
          // do not limit the value to maxlength when set programatically
          this.#unmaskedValue = newValue;

          // set validity
          this.#setValidity();

          this.#applyMask();
        }
        break;
      }

      case "pattern":
      case "required":
      case "maxlength":
      case "minlength":
      case "step":
      case "min":
      case "max": {
        this.#setValidity();
        break;
      }

      case "dir": {
        if (oldValue !== newValue) {
          this.#applyMask();
        }
        break;
      }
    }
  }

  #trySetSelectionRange = (start, end, direction) => {
    try {
      this.setSelectionRange(start, end, direction);
    } catch {}
  };

  #setValidity = () => {
    const nativeInput = this.#getNativeInput();
    const validationMessage = nativeInput.checkValidity()
      ? ""
      : nativeInput.validationMessage;
    this.setCustomValidity(validationMessage);
  };

  #applyMask = () => {
    const isRTL = this.matches(":dir(rtl)");
    const mask = isRTL
      ? MaskedInput.#toGraphemes(this.#mask).slice().reverse().join("")
      : this.#mask;
    const unmaskedValue = isRTL
      ? MaskedInput
          .#toGraphemes(this.#unmaskedValue)
          .slice()
          .reverse()
          .join("")
      : this.#unmaskedValue;
    const chars = MaskedInput.#toGraphemes(unmaskedValue ?? "");

    this.#characterSlots = [];
    this.#replacementSlots = 0;
    this.#valueCharacterCount = chars.length;

    const usedDisplayChars = [];
    let position = 0;
    let maskedValue = mask.replaceAll(
      this.#maskReplacementCharacter,
      (match, offset) => {
        const char = chars.shift();
        // replace actual char with bullet character
        const displayChar =
          char == null
            ? this.hasAttribute("show-replacement-characters")
              ? match
              : " "
            : this.#internalType === "password"
            ? this.#passwordChar
            : char;
        const charLength = displayChar?.length ?? 1;
        const nextPosition = position + charLength;
        const maskOffset =
          usedDisplayChars.join("").length -
          usedDisplayChars.length * this.#maskReplacementCharacter.length +
          offset;

        this.#characterSlots.push({
          char,
          displayChar,
          position: { start: position, end: nextPosition },
          positionInMask: { start: maskOffset, end: maskOffset + charLength },
        });

        usedDisplayChars.push(displayChar);
        position = nextPosition;
        this.#replacementSlots++;

        return displayChar;
      }
    );

    // add extra characters to end of mask
    let maskEndPosition = maskedValue.length;
    chars.forEach((char) => {
      const displayChar =
        this.#internalType === "password" && char != null ? "•" : char;
      const nextPosition = position + displayChar.length;
      const nextMaskEndPosition = maskEndPosition + displayChar.length;

      this.#characterSlots.push({
        char,
        displayChar,
        position: { start: position, end: nextPosition },
        positionInMask: {
          start: maskEndPosition,
          end: nextMaskEndPosition,
        },
      });
      maskedValue += displayChar;

      position = nextPosition;
      maskEndPosition = nextMaskEndPosition;
    });

    if (isRTL) {
      maskedValue = MaskedInput
        .#toGraphemes(maskedValue)
        .reverse()
        .join("");
      this.#characterSlots.reverse();
    }

    this.#maskedValue = maskedValue;
    const unmaskedDisplayValue = this.#characterSlots
      .map(({ displayChar }) => displayChar)
      .filter(Boolean)
      .join("");

    // grab current selectionDirection
    const currentSelectionDirection = this.selectionDirection;

    // apply mask
    super.value = this.#getMaskVisibility()
      ? this.#maskedValue
      : unmaskedDisplayValue;

    // reapply selection direction since setting the super value removes it
    this.#trySetSelectionRange(
      this.selectionStart,
      this.selectionEnd,
      currentSelectionDirection
    );
  };

  #getMaskVisibility = () => {
    if (this.#valueCharacterCount === 0) {
      return this.hasAttribute("show-empty-mask");
    } else if (this.#valueCharacterCount > this.#replacementSlots) {
      return this.hasAttribute("show-overflowed-mask");
    } else {
      return true;
    }
  };

  #getSelectionPosition = () => {
    const isMaskShown = this.#getMaskVisibility();
    const selectedCharIndexes = [];
    let charIndexBeforeSelection;
    let charIndexAfterSelection;

    this.#characterSlots.forEach(
      ({ char, position, positionInMask }, index) => {
        const { start: charStartPosition, end: charEndPostition } = isMaskShown
          ? positionInMask
          : position;
        if (charEndPostition <= this.selectionStart) {
          charIndexBeforeSelection = index;
        } else if (charStartPosition >= this.selectionEnd) {
          charIndexAfterSelection ??= index;
        } else if (char != null) {
          selectedCharIndexes.push(index);
        }
      }
    );

    return {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
    };
  };

  #getPositionOfCharAtIndex = (index) => {
    if (index == null || Number.isNaN(index)) {
      return NaN;
    }

    if (this.#characterSlots.length === 0) {
      // no mask and no value chars
      return { start: 0, end: 0 };
    }

    const positionKey = this.#getMaskVisibility()
      ? "positionInMask"
      : "position";
    return this.#characterSlots.at(index)?.[positionKey];
  };

  #getEndPosition = () => {
    if (this.#valueCharacterCount === 0) {
      // no value chars
      return this.#getPositionOfCharAtIndex(0).start;
    } else if (this.#valueCharacterCount >= this.#replacementSlots) {
      // filled OR overfilled the mask
      return this.#getPositionOfCharAtIndex(-1).end;
    } else {
      return this.#getPositionOfCharAtIndex(this.#valueCharacterCount).start;
    }
  };

  #deleteBackward = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();
    const selectionDirection = this.selectionDirection;

    if (charIndexBeforeSelection == null && selectedCharIndexes.length === 0) {
      return;
    }

    const mapper =
      selectedCharIndexes.length > 0
        ? ({ char }, i) => (selectedCharIndexes.includes(i) ? null : char)
        : ({ char }, i) => (i !== charIndexBeforeSelection ? char : null);
    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (selectedCharIndexes.length > 0) {
      if (selectedCharIndexes.at(0) >= this.#valueCharacterCount) {
        nextPosition = this.#getEndPosition();
      } else {
        nextPosition = this.#getPositionOfCharAtIndex(
          selectedCharIndexes.at(0)
        ).start;
      }
    } else if (
      this.#valueCharacterCount >= this.#replacementSlots &&
      charIndexAfterSelection == null
    ) {
      // at the end of an overflowed mask
      nextPosition = this.#getEndPosition();
    } else {
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).start;
    }

    this.#trySetSelectionRange(nextPosition, nextPosition, selectionDirection);
  };

  #deleteForward = () => {
    const {
      charIndexBeforeSelection,
      selectedCharIndexes,
      charIndexAfterSelection,
      selectionStart,
      selectionEnd,
    } = this.#getSelectionPosition();

    if (charIndexAfterSelection == null && selectedCharIndexes.length === 0) {
      return;
    }

    const mapper =
      selectedCharIndexes.length > 0
        ? ({ char }, i) => (selectedCharIndexes.includes(i) ? null : char)
        : ({ char }, i) => (i !== charIndexAfterSelection ? char : null);

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (selectedCharIndexes.length > 0) {
      nextPosition =
        selectionStart ===
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
          ? selectionStart
          : this.#getPositionOfCharAtIndex(selectedCharIndexes.at(0)).start;
    } else if (charIndexBeforeSelection == null) {
      nextPosition = this.#getPositionOfCharAtIndex(0).start;
    } else if (charIndexAfterSelection > this.#characterSlots.length - 1) {
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).end;
    } else {
      const startOfEnd = this.#getPositionOfCharAtIndex(
        charIndexAfterSelection
      ).start;
      const endOfStart = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).end;
      nextPosition =
        endOfStart === this.selectionStart ? endOfStart : startOfEnd;
    }

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #deleteToBeginning = () => {
    const { charIndexBeforeSelection } = this.#getSelectionPosition();

    if (charIndexBeforeSelection == null) {
      return;
    }

    const mapper = ({ char }, i) =>
      i <= charIndexBeforeSelection ? null : char;

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #deleteToEnd = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectionStart,
    } = this.#getSelectionPosition();

    if (charIndexAfterSelection == null) {
      return;
    }

    const mapper = ({ char }, i) => (i < charIndexAfterSelection ? char : null);

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      selectionStart ===
      (charIndexBeforeSelection != null &&
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end)
        ? selectionStart
        : this.#getEndPosition();
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  /**
   * @param {string} string
   * @returns {string} the last word and any trailing non-words
   */
  #lastWord = (string) => {
    if (Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(this.#getElementLang(), {
        granularity: "word",
      });
      const segments = Array.from(segmenter.segment(string));
      let foundWord = false;
      return segments.reduceRight((endString, { segment, isWordLike }) => {
        if (foundWord) return endString;
        if (isWordLike) {
          foundWord = true;
        }
        return segment + endString;
      }, "");
    } else {
      // won't work for graphemes
      const [lastWord] = /\b\w+(\W+)?$/.exec(string) ?? [""];
      return lastWord;
    }
  };

  /**
   * @param {string} string
   * @returns {string} the first word and any leading non-words
   */
  #firstWord = (string) => {
    if (Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(this.#getElementLang(), {
        granularity: "word",
      });
      const segments = Array.from(segmenter.segment(string));
      let foundWord = false;
      return segments.reduce((startString, { segment, isWordLike }) => {
        if (foundWord) return startString;
        if (isWordLike) {
          foundWord = true;
        }
        return startString + segment;
      }, "");
    } else {
      // won't work for graphemes
      const [firstWord] = /^(\W+)?\w+\b/.exec(string) ?? [""];
      return firstWord;
    }
  };

  #deleteWordForward = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      this.#deleteForward();
      return;
    }

    if (charIndexAfterSelection == null) return;

    const unmaskedCursorPosition = this.#characterSlots.at(
      charIndexAfterSelection
    ).position.start;
    const valueStart = this.#unmaskedValue.slice(0, unmaskedCursorPosition);
    const valueEnd = this.#unmaskedValue.slice(unmaskedCursorPosition);
    const nextWord = this.#firstWord(valueEnd);
    const nextValueEnd = valueEnd.slice(nextWord.length);

    const didChange = this.#setValue(valueStart + nextValueEnd);

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      charIndexBeforeSelection != null
        ? this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
        : this.#getPositionOfCharAtIndex(0).start;

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #getElementLang = () => {
    let lang;
    let element = this;
    while (!lang && element) {
      lang = element.lang;
      element = element.parentElement;
    }
    return lang;
  };

  #deleteWordBackward = () => {
    const { charIndexBeforeSelection, selectedCharIndexes } =
      this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      this.#deleteBackward();
      return;
    }

    if (charIndexBeforeSelection == null) return;

    const unmaskedCursorPosition = this.#characterSlots.at(
      charIndexBeforeSelection
    ).position.end;
    const valueStart = this.#unmaskedValue.slice(0, unmaskedCursorPosition);
    const previousWord = this.#lastWord(valueStart);
    const nextValueStart =
      previousWord.length > 0
        ? valueStart.slice(0, -1 * previousWord.length)
        : valueStart;

    const valueEnd = this.#unmaskedValue.slice(unmaskedCursorPosition);
    const didChange = this.#setValue(nextValueStart + valueEnd);

    if (!didChange) {
      return;
    }

    this.#applyMask();

    const beginningCharCount =
      MaskedInput.#toGraphemes(nextValueStart).length;
    const endCharCount = MaskedInput.#toGraphemes(valueEnd).length;

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (beginningCharCount === 0) {
      nextPosition = this.#getPositionOfCharAtIndex(0).start;
    } else if (beginningCharCount + endCharCount < this.#replacementSlots) {
      nextPosition = this.#getPositionOfCharAtIndex(beginningCharCount).start;
    } else {
      nextPosition = this.#getPositionOfCharAtIndex(beginningCharCount - 1).end;
    }

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #deleteEntireValue = () => {
    const didChange = this.#setValue("");

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #insertText = (data) => {
    const {
      charIndexAfterSelection,
      charIndexBeforeSelection,
      selectedCharIndexes,
      selectionStart,
    } = this.#getSelectionPosition();
    const insertedTextLength = MaskedInput.#toGraphemes(data).length;
    const unmaskedSelectionStart =
      charIndexBeforeSelection != null
        ? this.#characterSlots.at(charIndexBeforeSelection).position.end
        : 0;
    const unmaskedSelectionEnd =
      selectedCharIndexes.length > 0
        ? this.#characterSlots.at(selectedCharIndexes.at(-1)).position.end
        : charIndexAfterSelection != null
        ? this.#characterSlots.at(charIndexAfterSelection).position.start
        : this.#unmaskedValue.length;

    const valueBeginning = this.#unmaskedValue.slice(0, unmaskedSelectionStart);
    const valueEnd = this.#unmaskedValue.slice(unmaskedSelectionEnd);

    const didChange = this.#setValue(valueBeginning + data + valueEnd);

    if (!didChange) {
      return;
    }

    this.#applyMask();

    let nextPosition;
    if (charIndexAfterSelection == null) {
      nextPosition = this.#getEndPosition();
    } else if (charIndexBeforeSelection == null) {
      nextPosition =
        insertedTextLength === this.#valueCharacterCount
          ? this.#getEndPosition()
          : this.#getPositionOfCharAtIndex(insertedTextLength).start;
    } else {
      nextPosition =
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end ===
        selectionStart
          ? this.#getPositionOfCharAtIndex(
              charIndexBeforeSelection + insertedTextLength
            ).end
          : this.#getPositionOfCharAtIndex(
              charIndexBeforeSelection + insertedTextLength + 1
            ).start;
    }
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #insertTranspose = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();
    const atEndOfValue = charIndexAfterSelection == null;

    if (
      charIndexBeforeSelection == null ||
      (atEndOfValue && charIndexBeforeSelection === 0)
    ) {
      // at beginning of value, or at end of single char value
      return;
    }
    const firstChar = this.#characterSlots.at(
      atEndOfValue ? charIndexBeforeSelection - 1 : charIndexBeforeSelection
    );
    const secondChar = this.#characterSlots.at(
      atEndOfValue ? charIndexBeforeSelection : charIndexAfterSelection
    );
    const didChange = this.#setValue(
      this.#characterSlots
        .map((valueChar) => {
          if (valueChar === firstChar) {
            return secondChar.char;
          } else if (valueChar === secondChar) {
            return firstChar.char;
          } else {
            return valueChar.char;
          }
        })
        .join("")
    );

    if (!didChange) {
      return;
    }

    const nextPosition = this.#getPositionOfCharAtIndex(
      this.#characterSlots.indexOf(secondChar)
    ).end;
    this.#applyMask();
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  /**
   *
   * @param {string} value - the unmasked value to set
   * @returns true if and only if the value has changed
   */
  #setValue = (value) => {
    const prevValue = this.#unmaskedValue;
    const maxLength = parseInt(this.maxLength, 10);
    if (typeof value !== "string") {
      this.#unmaskedValue = "";
    } else if (this.#internalType === "number") {
      const nativeNumberInput = this.#getNativeInput();
      nativeNumberInput.value = value; // coercion and validation will happen here
      this.#unmaskedValue = nativeNumberInput.value;
    } else if (!Number.isNaN(maxLength) && maxLength >= 0) {
      this.#unmaskedValue = value.slice(0, maxLength);
    } else {
      this.#unmaskedValue = value;
    }

    // set validity
    this.#setValidity();

    return this.#unmaskedValue !== prevValue;
  };

  #getNativeInput = () => {
    const nativeInput = document.createElement("input");
    nativeInput.type = this.#internalType;
    nativeInput.value = this.#unmaskedValue;

    for (const { name, value } of this.attributes) {
      if (
        [
          "type",
          "value",
          "is",
          "class",
          "style",
          "mask-pattern",
          "mask-replacement-character",
          "show-overflowed-mask",
          "show-empty-mask",
          "show-replacement-characters",
        ].includes(name)
      ) {
        continue;
      }
      nativeInput.setAttribute(name, value);
    }
    return nativeInput;
  };

  // Not all characters have a length of 1, so split the string on unicode graphemes
  // to preserve multi-byte characters
  static #toGraphemes = (string) => {
    if (typeof string !== "string") return [];

    try {
      const segmenter = new Intl.Segmenter();
      return Array.from(segmenter.segment(string)).map(
        ({ segment }) => segment
      );
    } catch {
      // this won't work for grapheme clusters like flags or skin-tone emoji, but it's better than nothing
      const graphemes = [];
      string.replaceAll(/\p{Any}/gu, (grapheme) => {
        graphemes.push(grapheme);
      });
      return graphemes;
    }
  };

  static #parseNumber = (() => {
    // much more forgiving than Number.parseFloat()
    function parseFloat(str) {
      const indexOfDecimal = str.indexOf(".");

      if (indexOfDecimal > -1) {
        const whole = parseInt(str.slice(0, indexOfDecimal));
        const fractional = str.slice(indexOfDecimal).replaceAll(/\D/g, "");

        return `${whole}.${fractional}`;
      }

      return parseInt(str);
    }

    // much more forgiving than Number.parseInt
    function parseInt(str) {
      const indexOfNegativeSign = str.indexOf("-");
      const indexOfFirstDigit = "0123456789"
        .split("")
        .map((digit) => str.indexOf(digit))
        .reduce(
          (a, b) => (a > -1 && b > -1 ? Math.min(a, b) : Math.max(a, b)),
          -1
        );

      const isNegative =
        indexOfNegativeSign > -1 &&
        indexOfFirstDigit > -1 &&
        indexOfNegativeSign < indexOfFirstDigit;

      return `${isNegative ? "-" : ""}${str.replaceAll(/\D/g, "")}`;
    }

    return (string) => {
      const { 0: eChar, index: indexOfE } = /e/i.exec(string) ?? {
        0: "",
        index: -1,
      };

      if (indexOfE > -1) {
        let base = parseFloat(string.slice(0, indexOfE));
        let exponent = parseInt(string.slice(indexOfE));

        return `${base}${eChar}${exponent}`;
      }

      return parseFloat(string);
    };
  })();

  #handleInput = (event) => {
    const { inputType, data, isComposing } = event;

    if (isComposing) {
      return;
    }

    if (
      this.#internalType !== "number" &&
      parseInt(this.maxLength, 10) >= 0 &&
      this.#unmaskedValue >= parseInt(this.maxLength, 10)
    ) {
      event.preventDefault();
      // do not process beforeinput event and do not dispatch input event
      return;
    }

    // stop reflecting the attribute once an input has occurred
    this.#isValueReflected = false;

    switch (inputType) {
      case "insertReplacementText": // autocomplete, spellcheck, auto-suggest, etc.
      case "insertFromYank": // ctrl+y on MacOS
      case "insertFromDrop": // drag-and-drop events
      case "insertFromPaste":
      case "insertFromPasteAsQuotation":
      // ignore "insertCompositionText" because interim values should be ignored, compositionend event will have final value
      case "insertText": {
        event.preventDefault();
        if (
          /apple/i.test(globalThis.navigator?.vendor) &&
          inputType === "insertText" &&
          this.selectionStart !== this.selectionEnd &&
          MaskedInput.#toGraphemes(data).length === 2
        ) {
          // this is actually a transposition in Safari
          // insertTranspose expects a cursor, not a selection, so find an appropriate position and set the selection range
          const { selectedCharIndexes } = this.#getSelectionPosition();
          const originalPosition = this.#getPositionOfCharAtIndex(
            selectedCharIndexes.at(0)
          ).end;
          this.#trySetSelectionRange(
            originalPosition,
            originalPosition,
            this.selectionDirection
          );
          this.#insertTranspose(data);
        } else {
          this.#insertText(
            this.#internalType === "number"
              ? MaskedInput.#parseNumber(data)
              : data
          );
        }
        break;
      }
      case "insertTranspose": {
        event.preventDefault();
        // Safari dispatches an "insertText" event with the transposed characters and the selected range
        // Firefox doesn't support transposition
        // Chrome works as expected
        // ctrl+t on MacOS
        this.#insertTranspose(data);
        break;
      }
      case "deleteWordBackward": {
        event.preventDefault();
        // opt+delete on MacOS
        this.#deleteWordBackward();
        break;
      }
      case "deleteWordForward": {
        event.preventDefault();
        this.#deleteWordForward();
        break;
      }
      case "deleteEntireSoftLine": {
        event.preventDefault();
        this.#deleteEntireValue();
        break;
      }
      case "deleteSoftLineBackward":
      case "deleteHardLineBackward": {
        event.preventDefault();
        this.#deleteToBeginning();
        break;
      }
      case "deleteSoftLineForward":
      case "deleteHardLineForward": {
        event.preventDefault();
        // ctrl+k on MacOS
        this.#deleteToEnd();
        break;
      }
      case "deleteByDrag":
      case "deleteByCut":
      case "deleteContent":
      case "deleteContentBackward": {
        event.preventDefault();
        // delete key
        this.#deleteBackward();
        break;
      }
      case "deleteContentForward": {
        event.preventDefault();
        this.#deleteForward();
        break;
      }
      default: {
        // ignore formatting and history input events
        return;
      }
    }

    // dispatch InputEvent for other listeners, since preventDefault stopped the native dispatch
    queueMicrotask(() => {
      this.dispatchEvent(
        new InputEvent("input", {
          inputType,
          data,
          isComposing,
          bubbles: true,
          cancelable: false,
        })
      );
    });
  };

  #handleAutofill = (event) => {
    if (
      [undefined, "insertReplacementText"].includes(event.inputType) &&
      event.isTrusted
    ) {
      this.#setValue(super.value);
      this.#applyMask();
    }
  };

  #updateClipboard = (event) => {
    event.preventDefault();
    if (this.#internalType === "password") {
      // password inputs disallow copying
      return;
    }
    const { selectedCharIndexes } = this.#getSelectionPosition();

    event.clipboardData.setData(
      "text/plain",
      this.#characterSlots
        .filter((_, idx) => selectedCharIndexes.includes(idx))
        .map(({ displayChar }) => displayChar)
        .join("")
    );
  };

  #handleCut = (event) => {
    this.#updateClipboard(event);
    this.#deleteBackward();
  };

  #handleDragData = (event) => {
    if (this.#internalType === "password") {
      event.preventDefault();
      return;
    }

    event.dataTransfer.clearData();
    const { selectedCharIndexes } = this.#getSelectionPosition();

    event.dataTransfer.setData(
      "text/plain",
      this.#characterSlots
        .filter((_, idx) => selectedCharIndexes.includes(idx))
        .map(({ displayChar }) => displayChar)
        .join("")
    );
  };

  #handleKeyboardNavigation = (event) => {
    const { metaKey, altKey, shiftKey, key } = event;
    if (metaKey && altKey) return; // match browser behavior

    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();
    const endOrCurrentPosition = Math.max(
      this.selectionEnd,
      this.#getEndPosition()
    );
    const firstOrCurrentPosition = Math.min(
      this.selectionStart,
      this.#getPositionOfCharAtIndex(0).start
    );
    const selectionExists = this.selectionStart !== this.selectionEnd;
    const isBackwardsSelection = this.selectionDirection === "backward";
    const unmaskedCursorPosition =
      selectionExists && isBackwardsSelection
        ? charIndexBeforeSelection != null
          ? this.#characterSlots.at(charIndexBeforeSelection).position.end
          : firstOrCurrentPosition
        : charIndexAfterSelection != null
        ? this.#characterSlots.at(charIndexAfterSelection).position.start
        : endOrCurrentPosition;

    let nextStart;
    let nextEnd;
    let nextDirection;

    switch (key) {
      case "ArrowRight": {
        const valueBeforeCursor = this.#unmaskedValue.slice(
          0,
          unmaskedCursorPosition
        );
        const firstWordAfterCursor = this.#firstWord(
          this.#unmaskedValue.slice(unmaskedCursorPosition)
        );
        const nextWordEndPosition =
          firstWordAfterCursor.length > 0
            ? this.#getPositionOfCharAtIndex(
                MaskedInput.#toGraphemes(
                  valueBeforeCursor + firstWordAfterCursor
                ).length - 1
              ).end
            : endOrCurrentPosition;
        const nextCharEndPosition =
          selectionExists &&
          isBackwardsSelection &&
          selectedCharIndexes.length > 0
            ? this.#getPositionOfCharAtIndex(selectedCharIndexes.at(0)).end
            : charIndexAfterSelection != null
            ? Math.min(
                endOrCurrentPosition,
                this.#getPositionOfCharAtIndex(charIndexAfterSelection).end
              )
            : endOrCurrentPosition;
        const maybeNextPosition = altKey
          ? nextWordEndPosition
          : nextCharEndPosition;

        if (metaKey) {
          nextStart = shiftKey
            ? isBackwardsSelection
              ? this.selectionEnd
              : this.selectionStart
            : endOrCurrentPosition;
          nextEnd = endOrCurrentPosition;
        } else {
          nextStart = shiftKey
            ? !isBackwardsSelection
              ? this.selectionStart
              : maybeNextPosition > this.selectionEnd
              ? this.selectionEnd
              : maybeNextPosition
            : maybeNextPosition;
          nextEnd = shiftKey
            ? !isBackwardsSelection
              ? maybeNextPosition
              : maybeNextPosition > this.selectionEnd
              ? maybeNextPosition
              : this.selectionEnd
            : maybeNextPosition;
        }

        nextDirection =
          nextStart === nextEnd
            ? "none"
            : nextEnd !== this.selectionEnd
            ? "forward"
            : "backward";
        break;
      }
      case "ArrowLeft": {
        const lastWordBeforeCursor = this.#lastWord(
          this.#unmaskedValue.slice(0, unmaskedCursorPosition)
        );
        const startValueWithoutLastWord = this.#unmaskedValue
          .slice(0, unmaskedCursorPosition)
          .slice(0, -1 * lastWordBeforeCursor.length);
        const previousWordStartPosition =
          lastWordBeforeCursor.length > 0 &&
          startValueWithoutLastWord.length > 0
            ? this.#getPositionOfCharAtIndex(
                MaskedInput.#toGraphemes(startValueWithoutLastWord)
                  .length - 1
              ).end
            : firstOrCurrentPosition;
        const prevCharStartPosition =
          selectionExists &&
          !isBackwardsSelection &&
          selectedCharIndexes.length > 0
            ? this.#getPositionOfCharAtIndex(selectedCharIndexes.at(-1)).start
            : charIndexBeforeSelection != null
            ? this.#getPositionOfCharAtIndex(charIndexBeforeSelection).start
            : firstOrCurrentPosition;
        const maybeNextPosition = altKey
          ? previousWordStartPosition
          : prevCharStartPosition;

        if (metaKey) {
          nextStart = firstOrCurrentPosition;
          nextEnd = shiftKey
            ? selectionExists && isBackwardsSelection
              ? this.selectionEnd
              : this.selectionStart
            : firstOrCurrentPosition;
        } else {
          nextStart = shiftKey
            ? isBackwardsSelection
              ? maybeNextPosition
              : maybeNextPosition < this.selectionStart
              ? maybeNextPosition
              : this.selectionStart
            : maybeNextPosition;
          nextEnd = shiftKey
            ? isBackwardsSelection
              ? this.selectionEnd
              : maybeNextPosition < this.selectionStart
              ? this.selectionStart
              : maybeNextPosition
            : maybeNextPosition;
        }

        nextDirection =
          nextStart === nextEnd
            ? "none"
            : nextStart !== this.selectionStart
            ? "backward"
            : "forward";
        break;
      }
      case "ArrowDown": {
        if (this.#internalType === "number") {
          this.stepDown();
          nextStart = this.#getEndPosition();
          nextEnd = this.#getEndPosition();
          break;
        } else if (this.list != null && this.#internalType !== "password") {
          // has an associated datalist; let the browser handle up/down arrows
          return;
        }
        // else fall through and do the same thing as "End"
      }
      case "End": {
        nextEnd = this.#getEndPosition();

        if (shiftKey) {
          // change selection
          if (this.selectionDirection === "backward") {
            nextStart = this.selectionEnd;
          } else {
            // selectionDirection is either "forward" or "none"
            nextStart = this.selectionStart;
          }
        } else {
          // non-selecting
          nextStart = this.#getEndPosition();
        }

        nextDirection = nextStart === nextEnd ? "none" : "forward";
        break;
      }
      case "ArrowUp": {
        if (this.#internalType === "number") {
          this.stepUp();
          nextStart = this.#getEndPosition();
          nextEnd = this.#getEndPosition();
          break;
        } else if (this.list != null && this.#internalType !== "password") {
          // has an associated datalist; let the browser handle up/down arrows
          return;
        }
        // else fall through and do the same thing as "Home"
      }
      case "Home": {
        const nextPosition = this.#getMaskVisibility()
          ? this.#getPositionOfCharAtIndex(this.#characterSlots.at(0)).start
          : 0;
        nextStart = nextPosition;

        if (shiftKey) {
          // change selection
          if (this.selectionDirection === "backward") {
            nextEnd = this.selectionEnd;
          } else {
            // selectionDirection is either "forward" or "none"
            nextEnd = this.selectionStart;
          }
        } else {
          // non-selecting
          nextEnd = nextPosition;
        }

        nextDirection = nextStart === nextEnd ? "none" : "backward";
        break;
      }
      default: {
        // return early to avoid preventing default and attempting to set the new range
        return;
      }
    }

    event.preventDefault();
    this.#trySetSelectionRange(nextStart, nextEnd, nextDirection);
  };

  #handleCompositionEnd = (event) => {
    this.#insertText(
      this.#internalType === "number"
        ? MaskedInput.#parseNumber(event.data)
        : event.data
    );
  };

  #setSelectionToValidPositions = () => {
    if (this.#replacementSlots === 0) {
      return this.#trySetSelectionRange(0, 0, this.selectionDirection);
    }
    if (this.#valueCharacterCount === 0) {
      const startPosition = this.#getPositionOfCharAtIndex(0).start;
      return this.#trySetSelectionRange(
        startPosition,
        startPosition,
        this.selectionDirection
      );
    }

    // get positions of all non-null characters
    const validPositions = this.#characterSlots
      .slice(0, this.#valueCharacterCount)
      .flatMap((_, idx) => {
        const { start, end } = this.#getPositionOfCharAtIndex(idx);
        return [start, end];
      });

    // if the next slot is a replacement slot that is not filled, get its start position
    if (this.#characterSlots.length > this.#valueCharacterCount) {
      validPositions.push(
        this.#getPositionOfCharAtIndex(this.#valueCharacterCount).start
      );
    }

    const start = validPositions.reduce((prev, curr) =>
      Math.abs(curr - this.selectionStart) <
      Math.abs(prev - this.selectionStart)
        ? curr
        : prev
    );
    const end = validPositions.reduce((prev, curr) =>
      Math.abs(curr - this.selectionEnd) < Math.abs(prev - this.selectionEnd)
        ? curr
        : prev
    );

    this.#trySetSelectionRange(start, end, this.selectionDirection);
  };

  #defaultBehaviors = new Map();
  #setDefaultFor = (name, defaultFn) => {
    const handler = (event) => {
      // wait to run the default function until after the event has finished bubbling
      // in case the author calls preventDefault() later in the bubbling phase
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          defaultFn(event);
        }
      });
    };
    if (!this.#defaultBehaviors.has(name)) {
      this.addEventListener(name, handler);
      this.#defaultBehaviors.set(name, handler);
    }
  };

  connectedCallback() {
    this.#setDefaultFor("beforeinput", this.#handleInput);
    this.#setDefaultFor("input", this.#handleAutofill);
    this.#setDefaultFor("compositionend", this.#handleCompositionEnd);
    this.#setDefaultFor("copy", this.#updateClipboard);
    this.#setDefaultFor("cut", this.#handleCut);
    this.#setDefaultFor("dragstart", this.#handleDragData);
    this.#setDefaultFor("focus", this.#setSelectionToValidPositions);
    this.#setDefaultFor("mouseup", this.#setSelectionToValidPositions);
    this.#setDefaultFor("keydown", this.#handleKeyboardNavigation);
  }

  disconnectedCallback() {
    for (const [name, handler] of this.#defaultBehaviors.entries()) {
      this.removeEventListener(name, handler);
    }
  }
}

customElements.define("masked-input", MaskedInput, { extends: "input" });
