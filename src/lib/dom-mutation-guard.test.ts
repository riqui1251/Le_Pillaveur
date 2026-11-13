import { describe, expect, it } from 'vitest'
import { DOM_MUTATION_GUARD } from './dom-mutation-guard'

type FakeNode = { parentNode: FakeNode | null; children: FakeNode[] }

function install() {
  function Node() {}
  const proto = Node.prototype as {
    removeChild(this: FakeNode, child: FakeNode): FakeNode
    insertBefore(this: FakeNode, node: FakeNode, ref: FakeNode | null): FakeNode
  }
  proto.removeChild = function (child) {
    if (child.parentNode !== this) throw new Error('NotFoundError')
    this.children = this.children.filter((c) => c !== child)
    child.parentNode = null
    return child
  }
  proto.insertBefore = function (node, ref) {
    if (ref && ref.parentNode !== this) throw new Error('NotFoundError')
    const at = ref ? this.children.indexOf(ref) : this.children.length
    this.children.splice(at, 0, node)
    node.parentNode = this
    return node
  }
  new Function('Node', DOM_MUTATION_GUARD)(Node)
  const make = (): FakeNode => Object.assign(Object.create(proto), { parentNode: null, children: [] })
  return { proto, make }
}

describe('DOM_MUTATION_GUARD', () => {
  it('ignore le retrait d’un nœud qui a changé de parent au lieu de lever', () => {
    const { proto, make } = install()
    const parent = make()
    const other = make()
    const child = make()
    proto.insertBefore.call(other, child, null)
    expect(() => proto.removeChild.call(parent, child)).not.toThrow()
    expect(other.children).toEqual([child])
  })

  it('ignore l’insertion devant un nœud qui a changé de parent', () => {
    const { proto, make } = install()
    const parent = make()
    const other = make()
    const ref = make()
    proto.insertBefore.call(other, ref, null)
    const node = make()
    expect(proto.insertBefore.call(parent, node, ref)).toBe(node)
    expect(parent.children).toEqual([])
  })

  it('laisse passer les opérations normales', () => {
    const { proto, make } = install()
    const parent = make()
    const a = make()
    const b = make()
    proto.insertBefore.call(parent, a, null)
    proto.insertBefore.call(parent, b, a)
    expect(parent.children).toEqual([b, a])
    proto.removeChild.call(parent, b)
    expect(parent.children).toEqual([a])
  })
})
