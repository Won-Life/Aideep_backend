# 작업 계획: fix-error-logging

- **날짜:** 2026-04-10
- **담당:** be-agent (Claude)
- **작업 범위:** `src/common/logging/`, `src/common/error/`

## 목표
에러 응답(300, 400, 404, 500 등)이 로그에 남지 않는 문제를 수정하여 모든 HTTP 응답이 Winston 로거를 통해 기록되도록 한다.

## 작업 항목
- [ ] LoggingInterceptor의 `logger.error()` 시그니처 수정 (trace/context 인자 순서)
- [ ] AllExceptionsFilter에 Winston 로거 주입 + 전체 에러 로깅 추가
- [ ] AllExceptionsFilter를 DI 기반으로 전환 (모듈 provider 등록)
- [ ] main.ts에서 filter 등록 방식 변경

## 영향 범위
- `src/common/logging/logging.interceptor.ts`
- `src/common/error/http-exception.filter.ts`
- `src/common/error/index.ts`
- `src/app.module.ts`
- `src/main.ts`

## 참고 사항
- nest-winston의 `error()` 메서드는 `(message, trace?, context?)` 시그니처 — `log()`와 다름
- 인터셉터를 타지 않는 404(미매칭 라우트)는 ExceptionFilter에서만 로깅 가능
- AllExceptionsFilter를 DI로 전환해야 Winston 로거 주입 가능
