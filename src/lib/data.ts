import catalogJson from '../data/catalog.json'
import type { Catalog, Point, VolumeId } from '../types'

export const catalog = catalogJson as unknown as Catalog
export const pointsById = new Map(catalog.points.map((point) => [point.id, point]))
export const unitsById = new Map(catalog.units.map((unit) => [unit.id, unit]))
export const lessonsById = new Map(catalog.lessons.map((lesson) => [lesson.id, lesson]))
export const volumesById = new Map(catalog.volumes.map((volume) => [volume.id, volume]))

export function pointsForVolume(volumeId: VolumeId): Point[] {
  const volume = volumesById.get(volumeId)
  return volume ? volume.unitIds.flatMap(pointsForUnit) : []
}

export function pointsForUnit(unitId: string): Point[] {
  const unit = unitsById.get(unitId)
  if (!unit) return []
  return unit.lessonIds.flatMap((lessonId) => lessonsById.get(lessonId)?.pointIds.map((id) => pointsById.get(id)!).filter(Boolean) ?? [])
}
