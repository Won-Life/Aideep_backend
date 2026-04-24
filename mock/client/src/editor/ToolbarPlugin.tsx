import { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import { $isCodeNode } from '@lexical/code';
import { $getNearestNodeOfType } from '@lexical/utils';

interface ToolbarPluginProps {
  showDebug: boolean;
  onDebugToggle: () => void;
}

export function ToolbarPlugin({ showDebug, onDebugToggle }: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsCode(selection.hasFormat('code'));

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType(anchorNode, element.constructor as any);
        setBlockType(parentList ? (parentList as any).getListType() : 'paragraph');
      } else if ($isCodeNode(element)) {
        setBlockType('code');
      } else {
        setBlockType(element.getType());
      }
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, updateToolbar]);

  const btn = (
    label: string,
    active: boolean,
    onClick: () => void,
    title?: string,
  ) => (
    <button
      className={`tb-btn ${active ? 'tb-active' : ''}`}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="ne-toolbar">
      <div className="tb-group">
        {btn('↩', false, () => editor.dispatchCommand(UNDO_COMMAND, undefined), 'Undo')}
        {btn('↪', false, () => editor.dispatchCommand(REDO_COMMAND, undefined), 'Redo')}
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        <span className="tb-block-label">{blockType}</span>
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        {btn('B', isBold, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'), 'Bold')}
        {btn('I', isItalic, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'), 'Italic')}
        {btn('U', isUnderline, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'), 'Underline')}
        {btn('S', isStrikethrough, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'), 'Strikethrough')}
        {btn('<>', isCode, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'), 'Inline Code')}
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        {btn('• List', blockType === 'bullet', () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined), 'Bullet List')}
        {btn('1. List', blockType === 'number', () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined), 'Numbered List')}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        {btn('Debug', showDebug, onDebugToggle, 'Toggle Debug Panel')}
      </div>
    </div>
  );
}
