import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/catalog.json'), 'utf8'))
const ids = (items) => new Set(items.map((item) => item.id))
const pointIds = ids(catalog.points)
const volumeIds = ids(catalog.volumes)
const unitIds = ids(catalog.units)
const lessonIds = ids(catalog.lessons)

assert.equal(catalog.volumes.length, 4)
assert.equal(catalog.units.length, 36)
assert.equal(catalog.lessons.length, 177)
assert.equal(catalog.points.length, 662)
assert.equal(pointIds.size, 662, '知识点 ID 有重复')
assert.equal(catalog.crossGradeLinks.length, 39)
assert.equal(crypto.createHash('sha256').update([...pointIds].sort().join('\n')).digest('hex'), '29e15e9d2ccdc14565ebb9478d3f5a029289e1afce5768b9b55e7e5221afc04f', '知识点 ID 未与合并资料一一对应')

const appearances = (lists) => {
  const counts = new Map()
  for (const list of lists) for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}
const unitsInVolumes = appearances(catalog.volumes.map((volume) => volume.unitIds))
const lessonsInUnits = appearances(catalog.units.map((unit) => unit.lessonIds))
const pointsInLessons = appearances(catalog.lessons.map((lesson) => lesson.pointIds))
for (const id of unitIds) assert.equal(unitsInVolumes.get(id), 1, `${id} 在岛屿路线中不是恰好出现一次`)
for (const id of lessonIds) assert.equal(lessonsInUnits.get(id), 1, `${id} 在单元路线中不是恰好出现一次`)
for (const id of pointIds) assert.equal(pointsInLessons.get(id), 1, `${id} 在课时路线中不是恰好出现一次`)

for (const volume of catalog.volumes) {
  assert.ok(volume.unitIds.every((id) => unitIds.has(id)), `${volume.id} 单元缺失`)
}
for (const unit of catalog.units) {
  assert.ok(volumeIds.has(unit.volumeId), `${unit.id} 册次缺失`)
  assert.ok(unit.lessonIds.every((id) => lessonIds.has(id)), `${unit.id} 课时缺失`)
  assert.ok(catalog.volumes.find((volume) => volume.id === unit.volumeId).unitIds.includes(unit.id), `${unit.id} 所属册次不匹配`)
}
for (const lesson of catalog.lessons) {
  assert.ok(unitIds.has(lesson.unitId), `${lesson.id} 单元缺失`)
  assert.ok(lesson.pointIds.every((id) => pointIds.has(id)), `${lesson.id} 知识点缺失`)
  assert.ok(catalog.units.find((unit) => unit.id === lesson.unitId).lessonIds.includes(lesson.id), `${lesson.id} 所属单元不匹配`)
}

const modes = { auto: 0, self: 0 }
const kinds = {}
for (const point of catalog.points) {
  assert.ok(volumeIds.has(point.volumeId) && unitIds.has(point.unitId) && lessonIds.has(point.lessonId), `${point.id} 回指缺失`)
  assert.ok(catalog.lessons.find((lesson) => lesson.id === point.lessonId).pointIds.includes(point.id), `${point.id} 课时路线不匹配`)
  assert.equal(catalog.units.find((unit) => unit.id === point.unitId).volumeId, point.volumeId, `${point.id} 册次路线不匹配`)
  assert.ok(point.prereq.every((id) => pointIds.has(id)), `${point.id} 前置缺失`)
  assert.ok(point.leadsTo.every((id) => pointIds.has(id)), `${point.id} 后续缺失`)
  assert.ok(point.name && point.source && point.task?.instruction, `${point.id} 内容缺失`)
  assert.ok(point.task.mode in modes, `${point.id} 模式无效`)
  modes[point.task.mode] += 1
  kinds[point.task.kind] = (kinds[point.task.kind] || 0) + 1
  if (point.task.mode === 'auto') {
    assert.equal(point.task.variants.length, 3, `${point.id} 必须有 3 个题目变体`)
    const signatures = point.task.variants.map((variant) => JSON.stringify([variant.prompt, variant.speechText, variant.answer, variant.options, variant.items, variant.pairs]))
    assert.equal(new Set(signatures).size, 3, `${point.id} 题目变体重复`)
    for (const variant of point.task.variants) {
      assert.ok(variant.prompt && variant.hint && variant.explanation, `${point.id} 缺少提示或解析`)
      const audioPath = path.join(root, 'public', variant.audio)
      assert.ok(fs.existsSync(audioPath) && fs.statSync(audioPath).size > 200, `${point.id} 缺少题目语音`)
      if (variant.kind === 'choice') {
        assert.ok(variant.options.includes(variant.answer), `${point.id} 答案不在选项中`)
        assert.equal(new Set(variant.options).size, variant.options.length, `${point.id} 选项重复`)
        const remainder = variant.prompt.match(/^(\d+) ÷ (\d+) = \?（商……余数）$/)
        if (remainder) {
          const left = Number(remainder[1]); const right = Number(remainder[2])
          assert.equal(variant.answer, `${Math.floor(left / right)}……${left % right}`, `${point.id} 余数答案错误`)
        }
      } else if (variant.kind === 'order') {
        assert.deepEqual([...variant.items].sort(), [...variant.answer].sort(), `${point.id} 排序项不匹配`)
      } else if (variant.kind === 'number' || variant.kind === 'tiles') {
        assert.ok(Number.isFinite(variant.answer), `${point.id} 数字答案无效`)
        const expression = variant.prompt.match(/^([\d\s+\-×÷]+) = \?$/)
        if (expression) {
          const parts = expression[1].trim().split(/\s+/)
          let result = Number(parts[0])
          for (let i = 1; i < parts.length; i += 2) {
            const operand = Number(parts[i + 1])
            result = parts[i] === '+' ? result + operand : parts[i] === '-' ? result - operand : parts[i] === '×' ? result * operand : result / operand
          }
          assert.equal(variant.answer, result, `${point.id} 算式答案错误`)
        }
      } else if (variant.kind === 'match') {
        assert.ok(variant.pairs.length >= 3, `${point.id} 配对不足`)
      } else {
        assert.fail(`${point.id} 题型无效`)
      }
    }
  } else {
    assert.ok(point.task.practice && point.task.example && point.task.checklist.length >= 2, `${point.id} 自查任务不完整`)
    const audioPath = path.join(root, 'public', point.task.audio)
    assert.ok(fs.existsSync(audioPath) && fs.statSync(audioPath).size > 200, `${point.id} 缺少任务语音`)
  }
}
for (const link of catalog.crossGradeLinks) {
  assert.ok(pointIds.has(link.fromId) && pointIds.has(link.toId), '跨册链接无效')
}
console.log(`知识点 ${catalog.points.length} / 自动判分 ${modes.auto} / 引导自评 ${modes.self}`)
console.log('题型分布', kinds)
