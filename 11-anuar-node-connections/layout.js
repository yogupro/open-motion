const wide = {
  width: 1146, height: 720,
  nodes: [
    { id: 'intake', x: 40, y: 194, width: 228, height: 184 },
    { id: 'parser', x: 447, y: 337, width: 229, height: 168 },
    { id: 'indexer', x: 855, y: 218, width: 243, height: 227 }
  ]
}

const phone = {
  portrait: true, width: 390, height: 850,
  nodes: [
    { ...wide.nodes[0], x: 26, y: 28 },
    { ...wide.nodes[1], x: 131, y: 281 },
    { ...wide.nodes[2], x: 36, y: 531 }
  ]
}

export function chooseLayout(width, height) {
  return width < height ? phone : wide
}

export function fitLayout(width, height, layout) {
  const zoom = Math.min(width / layout.width, height / layout.height)
  return { x: (width - zoom * layout.width) / 2, y: (height - zoom * layout.height) / 2, zoom }
}
