// data/*.json 폴백 저장소 공용 쓰기 헬퍼.
// 같은 파일에 동시 쓰기가 겹칠 때 반쯤 쓰인 JSON이 남지 않도록
// 임시 파일에 쓴 뒤 rename으로 교체한다 (rename은 같은 볼륨 내에서 원자적).
import fs from "fs"

export function atomicWriteFileSync(filePath: string, content: string) {
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, "utf-8")
  fs.renameSync(tmpPath, filePath)
}

export function atomicWriteJsonSync(filePath: string, value: unknown) {
  atomicWriteFileSync(filePath, JSON.stringify(value, null, 2))
}
