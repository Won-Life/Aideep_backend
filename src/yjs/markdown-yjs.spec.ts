import * as Y from 'yjs';
import { markdownToYjsUpdate } from './markdown-yjs';

// Y.XmlText/XmlElement 트리를 순회해 텍스트만 뽑는다 (렌더될 실제 내용 확인용)
function collectText(node: any): string {
  if (node instanceof Y.XmlText) {
    return node
      .toDelta()
      .map((d: any) =>
        typeof d.insert === 'string' ? d.insert : collectText(d.insert)
      )
      .join('');
  }
  if (node instanceof Y.XmlElement) {
    return node.toArray().map(collectText).join('');
  }
  return '';
}

describe('markdownToYjsUpdate', () => {
  const MD = '# 회의 제목\n\n- 항목1\n- 항목2';

  function decode(update: Uint8Array) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    return doc.get('root', Y.XmlText);
  }

  it('평문이 아니라 Lexical 노드 구조(XmlElement 임베드)를 만든다', () => {
    const root = decode(markdownToYjsUpdate(MD));
    const delta = root.toDelta();

    // 버그판은 delta[0].insert가 원문 문자열(평문). 정상판은 임베드된 XmlElement.
    expect(delta.length).toBeGreaterThan(0);
    expect(typeof delta[0].insert).not.toBe('string');
    expect(root.toString()).not.toBe(MD); // 원문 그대로가 아님
  });

  it('마크다운 내용(제목·항목)이 보존된다', () => {
    const text = collectText(decode(markdownToYjsUpdate(MD)));
    expect(text).toContain('회의 제목');
    expect(text).toContain('항목1');
    expect(text).toContain('항목2');
  });

  it('빈 문자열도 예외 없이 처리한다', () => {
    expect(() => markdownToYjsUpdate('')).not.toThrow();
  });
});
