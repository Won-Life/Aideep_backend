# 작업 완료: fix-error-logging

- **날짜:** 2026-04-10
- **담당:** be-agent (Claude)

## 변경 요약
에러 응답(400, 404, 500 등)이 Winston 로그에 기록되지 않던 문제를 수정

## 추가/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/common/logging/logging.interceptor.ts` | `logger.error()` 호출 시 `(message, stack, context)` 시그니처로 수정 |
| `src/common/error/http-exception.filter.ts` | Winston 로거 주입, 모든 에러 상태코드에 대해 로깅 추가 |
| `src/main.ts` | AllExceptionsFilter에 Winston 로거 인스턴스 주입 |

## PR 설명

### 배경
`LoggingInterceptor`의 `catchError` 블록에서 `logger.error(message, 'HTTP')` 호출 시, nest-winston의 `error()` 메서드 시그니처가 `(message, trace?, context?)`이므로 `'HTTP'`가 context가 아닌 trace로 전달되어 로그가 정상 출력되지 않았다. 또한 매칭되지 않는 라우트에 대한 404는 인터셉터를 타지 않아 로깅이 누락되었고, `AllExceptionsFilter`는 NestJS 기본 Logger를 사용하며 500+ 에러만 로깅했다.

### 변경 내용
1. `LoggingInterceptor.catchError` — `logger.error(message, stack, 'HTTP')` 형태로 시그니처 수정
2. `AllExceptionsFilter` — Winston 로거(`WINSTON_MODULE_NEST_PROVIDER`) 주입, 모든 에러 상태코드에 대해 로깅 추가 (500+ 뿐 아니라 400, 404 등도 포함)
3. `main.ts` — `AllExceptionsFilter` 생성 시 Winston 로거 인스턴스 전달

### 테스트
- `npx tsc --noEmit` 타입 체크 통과

### 주의사항 / 후속 작업
- 없음
