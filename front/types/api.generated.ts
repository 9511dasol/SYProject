/**
 * 이 파일은 자동 생성됩니다. 직접 고치지 마세요.
 *
 * 생성:  npm run types:generate   (백엔드 OpenAPI 기준)
 * 확인:  npm run types:check      (백엔드와 어긋났는지)
 *
 * 손으로 쓴 타입 대신 이 파일을 참조하면, 백엔드 응답이 바뀌었을 때
 * 런타임이 아니라 타입 검사에서 먼저 드러납니다.
 */

export interface paths {
    "/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Root */
        get: operations["read_root__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/ai-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * AI 프로바이더 현황 조회
         * @description 현재 LLM_PROVIDER, 모델, API 키 설정 여부를 반환합니다. 실제 키 값은 노출하지 않습니다.
         */
        get: operations["get_ai_status_api_admin_ai_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/ai-usage-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Ai Usage Logs */
        get: operations["list_ai_usage_logs_api_admin_ai_usage_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/ai-usage-logs/budget": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Usage Budget */
        patch: operations["update_usage_budget_api_admin_ai_usage_logs_budget_patch"];
        trace?: never;
    };
    "/api/admin/ai-usage-logs/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Usage Summary */
        get: operations["get_usage_summary_api_admin_ai_usage_logs_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/periods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Periods */
        get: operations["list_periods_api_admin_periods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/periods/{year}/{month}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Period
         * @description 해당 연월의 데이터 행·코멘트·엑셀 원본을 모두 삭제한다 (되돌릴 수 없음).
         */
        delete: operations["delete_period_api_admin_periods__year___month__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/periods/{year}/{month}/budgets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Media Budgets
         * @description 엑셀 summary '■ 매체별 예산'에 채울 값.
         *
         *     해당 기간에 저장된 값이 없으면 그 이전 기간에서 이어받는다 — 어디서 왔는지는
         *     inherited_from 으로 알려준다.
         */
        get: operations["get_media_budgets_api_admin_periods__year___month__budgets_get"];
        /** Update Media Budgets */
        put: operations["update_media_budgets_api_admin_periods__year___month__budgets_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/report-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Report Logs */
        get: operations["list_report_logs_api_admin_report_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/report-logs/{log_id}/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resend Report
         * @description 실패한 발송 건을 같은 조건으로 다시 시도한다.
         */
        post: operations["resend_report_api_admin_report_logs__log_id__resend_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Settings */
        get: operations["list_settings_api_admin_settings_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/settings/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Setting */
        patch: operations["update_setting_api_admin_settings__key__patch"];
        trace?: never;
    };
    "/api/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_admin_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_api_admin_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/users/{user_id}/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Active */
        patch: operations["update_active_api_admin_users__user_id__active_patch"];
        trace?: never;
    };
    "/api/admin/users/{user_id}/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Profile */
        patch: operations["update_profile_api_admin_users__user_id__profile_patch"];
        trace?: never;
    };
    "/api/admin/users/{user_id}/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset Password */
        post: operations["reset_password_api_admin_users__user_id__reset_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/users/{user_id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Role */
        patch: operations["update_role_api_admin_users__user_id__role_patch"];
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Me */
        get: operations["read_me_api_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Me */
        patch: operations["update_me_api_auth_me_patch"];
        trace?: never;
    };
    "/api/auth/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change Password */
        post: operations["change_password_api_auth_me_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh */
        post: operations["refresh_api_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register */
        post: operations["register_api_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Audit Logs */
        get: operations["list_audit_logs_api_dev_audit_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/companies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Companies
         * @description 기업 목록 + 기업별 현황(계정 수·admin·이번 달 토큰 사용량·예산)을 한 번에.
         */
        get: operations["list_companies_api_dev_companies_get"];
        put?: never;
        /** Create Company */
        post: operations["create_company_api_dev_companies_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/companies/{company_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Company
         * @description 체험 기업 물리 삭제. 실기업은 정지(soft)만 가능하다 — 400.
         */
        delete: operations["delete_company_api_dev_companies__company_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/companies/{company_id}/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Company Active
         * @description 기업 정지/재개 — 정지하면 소속 계정 전원이 즉시(매 요청 검사) 차단된다.
         */
        patch: operations["update_company_active_api_dev_companies__company_id__active_patch"];
        trace?: never;
    };
    "/api/dev/companies/{company_id}/admin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Issue Company Admin
         * @description 기업의 admin 계정 발급 — 기업당 1개는 DB(partial unique)가 강제한다.
         */
        post: operations["issue_company_admin_api_dev_companies__company_id__admin_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/companies/{company_id}/budget": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Company Budget */
        patch: operations["update_company_budget_api_dev_companies__company_id__budget_patch"];
        trace?: never;
    };
    "/api/dev/trials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Trial
         * @description 체험 샌드박스 발급 — 기업+계정+샘플 데이터+소액 예산이 한 번에 만들어진다.
         *
         *     응답의 password 는 이 자리에서만 노출된다(서버에는 해시만 남는다).
         */
        post: operations["create_trial_api_dev_trials_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/trials/{company_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Extend Trial
         * @description 체험 기간 연장 — 지금부터 days 일 뒤로 만료를 다시 잡는다.
         */
        patch: operations["extend_trial_api_dev_trials__company_id__patch"];
        trace?: never;
    };
    "/api/dev/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_dev_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_api_dev_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete User
         * @description 계정 영구 삭제. 데이터 이력(사용량 로그 등)은 남는다 — 지우는 건 계정뿐이다.
         */
        delete: operations["delete_user_api_dev_users__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/users/{user_id}/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update User Active */
        patch: operations["update_user_active_api_dev_users__user_id__active_patch"];
        trace?: never;
    };
    "/api/dev/users/{user_id}/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update User Profile */
        patch: operations["update_user_profile_api_dev_users__user_id__profile_patch"];
        trace?: never;
    };
    "/api/dev/users/{user_id}/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset User Password */
        post: operations["reset_user_password_api_dev_users__user_id__reset_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dev/users/{user_id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update User Role */
        patch: operations["update_user_role_api_dev_users__user_id__role_patch"];
        trace?: never;
    };
    "/api/dev/users/{user_id}/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Unlock User
         * @description 로그인 연속 실패 잠금 해제.
         */
        patch: operations["unlock_user_api_dev_users__user_id__unlock_patch"];
        trace?: never;
    };
    "/api/heading/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Heading History
         * @description 로그인한 사용자가 과거에 생성한 문구 기록을 최신순으로 반환한다.
         *
         *     q 를 주면 파일명과 문구 본문에서 서버가 검색한다 — 화면이 이미 불러온
         *     기록만 거르면 오래된 기록은 전부 로드해야만 찾을 수 있었다. total 도
         *     검색 조건 기준이라 "더 보기" 페이지네이션이 검색 중에도 올바르게 끝난다.
         */
        get: operations["heading_history_api_heading_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/heading/history/{suggestion_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Heading History
         * @description 본인 소유의 문구 기록 한 건을 삭제한다.
         */
        delete: operations["delete_heading_history_api_heading_history__suggestion_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/heading/history/{suggestion_id}/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Heading History Image
         * @description 본인 소유 기록의 저장된 썸네일 이미지를 반환한다.
         */
        get: operations["heading_history_image_api_heading_history__suggestion_id__image_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/heading/suggest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Suggest Headings */
        post: operations["suggest_headings_api_heading_suggest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-filter/analyze": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Analyze Endpoint
         * @description 이미지 속 구성 요소(텍스트·로고·제품 등)를 bounding box 와 함께 추출.
         *
         *     프런트가 박스를 이미지 위에 겹쳐 그려 "클릭으로 수정 대상 특정"에 쓴다.
         */
        post: operations["analyze_endpoint_api_image_filter_analyze_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-filter/background-styles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Background Styles Endpoint
         * @description 고를 수 있는 배경 스타일 목록 — 프런트가 선택 UI를 그릴 때 쓴다.
         */
        get: operations["background_styles_endpoint_api_image_filter_background_styles_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-filter/backgrounds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Backgrounds Endpoint
         * @description 피사체는 유지하고 배경만 바꾼 시안을 고른 스타일 수만큼 생성해 돌려준다.
         *
         *     직접 입력한 배경은 줄바꿈으로 나눈다 — 쉼표로 나누는 프리셋 키와 달리 사람이
         *     쓴 문장에는 쉼표가 들어갈 수 있어서("흰 배경, 부드러운 그림자") 같은 구분자를
         *     쓰면 한 건이 두 건으로 쪼개진다.
         */
        post: operations["backgrounds_endpoint_api_image_filter_backgrounds_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-filter/edit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Edit Endpoint */
        post: operations["edit_endpoint_api_image_filter_edit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-resize/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Batch Endpoint
         * @description 선택한 매체 규격들로 비율 유지(중앙 크롭) 변환해 zip 으로 내려준다. AI 미사용.
         */
        post: operations["batch_endpoint_api_image_resize_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-resize/presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Presets Endpoint
         * @description 매체 규격 프리셋 목록 — 프런트 체크박스의 단일 출처.
         */
        get: operations["presets_endpoint_api_image_resize_presets_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-resize/resize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resize Endpoint */
        post: operations["resize_endpoint_api_image_resize_resize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/keyword-compare/parse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Parse Keyword Compare
         * @description 키워드 비교 Excel 파일(.xlsx) 파싱 — 시트별 이번/이전 비교 데이터 반환
         */
        post: operations["parse_keyword_compare_api_keyword_compare_parse_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/comment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update Comment
         * @description 해당 연월 vs 직전월 누적 DB 데이터를 비교해 AI 코멘트를 생성하고 저장.
         *
         *     LLM 호출이므로 다른 AI 도구와 똑같이 월 예산 게이트를 지나고, 쓴 토큰을
         *     ai_tool_usage_logs 에 남긴다. 예전에는 둘 다 없어서 이 버튼으로 쓴 토큰이
         *     관리자 화면의 사용량과 예산 집계에서 통째로 빠져 있었다.
         *
         *     실적이 그대로인데 버튼을 다시 누르면 AI 에게 글자 하나까지 같은 질문을 하는
         *     셈이라, 저장된 코멘트를 그대로 돌려준다(`cached: true`). 문구가 마음에 들지
         *     않아 다른 답을 받고 싶을 때는 force=true 로 다시 뽑는다.
         *
         *     비교 대상은 전월과 **전년 동월**이다 — 광고는 계절성이 강해 전월 비교만으로는
         *     판단이 왜곡된다. 달력상 그 달에 데이터가 없으면 가장 가까운 보유 월로 대신하고,
         *     대신한 사실은 프롬프트에 그대로 밝힌다.
         */
        post: operations["update_comment_api_marketing_comment_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/excel-periods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * List Excel Periods
         * @description 파일에 담긴 기간 목록만 돌려준다 — 업로드 모달의 기간 선택 화면 전용.
         *
         *     /load-excel 은 기간마다 매체 시트까지 전부 파싱하느라 큰 파일에서 수 분이 걸린다.
         *     고르는 단계에는 기간 이름·일수·코멘트만 있으면 되므로 그 비용을 치르지 않는다.
         */
        post: operations["list_excel_periods_api_marketing_excel_periods_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Export Excel
         * @description CSV → Excel 템플릿 채운 뒤 다운로드
         */
        post: operations["export_excel_api_marketing_export_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/export-db": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export Db Excel
         * @description DB에 저장된 연월 데이터를 Excel 템플릿으로 내려받기
         */
        get: operations["export_db_excel_api_marketing_export_db_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/export-db-result/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Export Task Result
         * @description 완료된 export 파일 다운로드 (1회용 — 내려준 뒤 보관본을 제거)
         */
        get: operations["get_export_task_result_api_marketing_export_db_result__task_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/export-db-task": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start Export Db Task
         * @description DB 데이터 → Excel 변환을 백그라운드로 시작하고 task_id 반환.
         *
         *     deliver_by="email"이면 완료된 파일을 메모리로 내려주는 대신 Supabase Storage에 올리고
         *     지정한 받는 사람(기본값: 로그인한 사용자)에게 다운로드 링크를 보낸다.
         */
        post: operations["start_export_db_task_api_marketing_export_db_task_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/export-db-task/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Export Task Status
         * @description 백그라운드 export 진행률 조회
         */
        get: operations["get_export_task_status_api_marketing_export_db_task__task_id__get"];
        put?: never;
        post?: never;
        /**
         * Cancel Export Task
         * @description 진행 중인 export 태스크를 취소 요청.
         *
         *     작업 행은 지우지 않고 취소 플래그만 세운다 — 워커가 단계마다 이 플래그를 읽어
         *     스스로 멈춰야 하기 때문이다. 행 자체는 TTL 정리 잡이 나중에 삭제한다.
         */
        delete: operations["cancel_export_task_api_marketing_export_db_task__task_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/load-excel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Load Excel
         * @description Excel 파일(.xlsx)을 읽어 기간별 리포트 데이터 JSON 반환.
         *
         *     한 파일에 5월·6월처럼 여러 달이 들어 있으면 달마다 하나씩 reports 에 담아 준다.
         *     period 를 주면 그 달만 읽는다 — 기간이 18개 담긴 파일에서 한 달만 열어 보려고
         *     나머지 17개를 파싱할 이유가 없다.
         *
         *     response_model 을 붙여 파서가 돌려준 dict 모양을 여기서 검증한다. 예전에는 순수
         *     dict 를 그대로 흘려보내서, 파서가 키를 바꾸면 프론트에서 조용히 undefined 가 됐다.
         */
        post: operations["load_excel_api_marketing_load_excel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/periods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Periods
         * @description 저장된 연월 목록 반환
         */
        get: operations["get_periods_api_marketing_periods_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Preview Report
         * @description CSV → DB 저장 + KPI 계산 후 JSON 리포트 반환
         */
        post: operations["preview_report_api_marketing_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/rows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upsert Row
         * @description 단일 행 (report_date, campaign_type) UPSERT
         */
        post: operations["upsert_row_api_marketing_rows_post"];
        /**
         * Delete Row
         * @description 단일 행 삭제 — (report_date, campaign_type) 기준, 자기 기업 행만
         */
        delete: operations["delete_row_api_marketing_rows_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/save-excel-data": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Save Excel Data
         * @description Excel 파일 매체 시트 데이터를 DB에 저장.
         *
         *     period 를 주면 고른 달만, 없으면 파일에 담긴 모든 달을 저장한다.
         *     replace=true 이면 저장 대상 달들의 기존 데이터를 각각 먼저 삭제하고 교체.
         *     save_comment=true 이면 파일에 담긴 기간 코멘트도 marketing_period_meta 에 반영한다.
         */
        post: operations["save_excel_data_api_marketing_save_excel_data_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/save-excel-task": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start Save Excel Task
         * @description Excel DB 저장을 백그라운드로 시작하고 task_id 반환.
         *
         *     period 를 주면 고른 달만, 없으면 파일에 담긴 모든 달을 저장한다.
         *     replace=true 이면 저장 대상 달들의 기존 행을 각각 지우고 교체한다.
         *     save_comment=true 이면 파일에 담긴 기간 코멘트도 marketing_period_meta 에 반영한다.
         */
        post: operations["start_save_excel_task_api_marketing_save_excel_task_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/save-excel-task/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Save Excel Task Status */
        get: operations["get_save_excel_task_status_api_marketing_save_excel_task__task_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/status/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Task Status */
        get: operations["get_task_status_api_marketing_status__task_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Summary
         * @description 특정 연월 DB 데이터를 preview 리포트와 동일한 형태로 반환
         */
        get: operations["get_summary_api_marketing_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/undo/{undo_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo Upload
         * @description CSV 업로드 되돌리기 — 이전 DB 상태로 복원 (자기 기업 스냅샷만)
         */
        post: operations["undo_upload_api_marketing_undo__undo_id__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/marketing/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload Files */
        post: operations["upload_files_api_marketing_upload_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Alerts */
        get: operations["list_alerts_api_rank_monitor_alerts_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/alerts/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Alerts Now
         * @description 지금 상태로 알림을 평가해 보낸다 — 설정을 고친 뒤 바로 확인할 때 쓴다.
         */
        post: operations["run_alerts_now_api_rank_monitor_alerts_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/collect/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Collect Now
         * @description 지금 네이버 API로 순위를 받아 적재하고, 이어서 알림까지 평가한다.
         *
         *     키워드 ID를 새로 찾아야 하면 광고 계정 전체를 훑느라 1분 안팎 걸릴 수 있다 —
         *     그래서 스레드풀에서 돌리고, 프런트는 이 요청에 상한을 걸지 않는다.
         */
        post: operations["run_collect_now_api_rank_monitor_collect_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/collect/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Collect Status
         * @description 자동 수집을 쓸 수 있는 상태인지 — 화면이 안내 문구를 고르는 데 쓴다.
         */
        get: operations["collect_status_api_rank_monitor_collect_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/snapshots/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upload Snapshot Report
         * @description 키워드 보고서(CSV/Excel)를 해당 날짜의 순위 스냅샷으로 적재한다.
         *
         *     같은 날짜를 다시 올리면 새 행이 아니라 갱신이다 — 몇 번을 올려도 결과가 같다.
         */
        post: operations["upload_snapshot_report_api_rank_monitor_snapshots_upload_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/watches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Watches */
        get: operations["list_watches_api_rank_monitor_watches_get"];
        put?: never;
        /**
         * Create Watches
         * @description 단건이든 대량이든 같은 경로 — 행별 성공/건너뜀/실패 사유를 돌려준다.
         *
         *     일부가 중복이어도 전체를 거절하지 않는다. 엑셀로 수백 건을 올리는 사용자는
         *     "몇 번째가 왜 안 됐는지"가 필요하지, 전부 되돌리고 다시 올리는 게 아니다.
         */
        post: operations["create_watches_api_rank_monitor_watches_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/watches/{watch_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Watch
         * @description 감시와 그 이력을 함께 삭제한다 (되돌릴 수 없음).
         */
        delete: operations["delete_watch_api_rank_monitor_watches__watch_id__delete"];
        options?: never;
        head?: never;
        /** Update Watch */
        patch: operations["update_watch_api_rank_monitor_watches__watch_id__patch"];
        trace?: never;
    };
    "/api/rank-monitor/watches/{watch_id}/bid-estimate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Watch Bid Estimate
         * @description 이 키워드를 N위로 노출하려면 얼마가 드는지 — 목표 순위를 정할 근거.
         *
         *     외부 API 를 디바이스 수만큼 호출하므로 스레드풀에서 돈다.
         */
        get: operations["watch_bid_estimate_api_rank_monitor_watches__watch_id__bid_estimate_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/watches/{watch_id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Watch History */
        get: operations["watch_history_api_rank_monitor_watches__watch_id__history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rank-monitor/watches/{watch_id}/insight": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Watch Insight
         * @description 이 키워드가 얼마나 치열한가 — 검색량·경쟁정도·평균 노출 광고 수.
         */
        get: operations["watch_insight_api_rank_monitor_watches__watch_id__insight_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/report-mail/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 발송 이력 조회
         * @description 발송 이력을 최신순으로 반환한다.
         *
         *     쿼리를 라우터에서 직접 짜지 않고 ReportLogRepository 를 쓴다 — 같은 테이블을
         *     읽는 관리자 화면(admin_report_log_router)과 정렬 기준이 갈라지지 않게 한다
         *     (레포는 created_at 이 같을 때 id 로 한 번 더 정렬해 순서가 흔들리지 않는다).
         */
        get: operations["get_logs_api_report_mail_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/report-mail/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 리포트 미리보기 (발송 없음)
         * @description 발송될 메일과 같은 제목·AI 코멘트·HTML 본문을 만들어 돌려준다.
         *
         *     검토되지 않은 AI 코멘트가 외부 수신자에게 바로 나가지 않도록, 화면은 이
         *     결과를 보여준 뒤에 발송을 받는다. 여기서 생성된 코멘트는 캐시에 저장되어
         *     뒤이은 발송이 그대로 재사용한다 — 미리보기를 거쳐도 비용이 두 번 들지 않는다.
         */
        post: operations["preview_report_api_report_mail_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/report-mail/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 리포트 메일 발송 (백그라운드)
         * @description 분석 → LLM 코멘트 → HTML 빌드 → 메일 발송을 백그라운드로 실행합니다.
         */
        post: operations["send_report_api_report_mail_send_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/report-mail/send/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 리포트 메일 발송 (동기 — 관리자 점검용)
         * @description 즉시 발송하고 결과를 반환합니다 (발송 설정 점검용).
         *
         *     예전에는 GET + 쿼리스트링이었다. 메일 발송은 부작용이 있는 동작이라 GET 으로
         *     두면 링크 프리페치나 캐시에 의해 의도치 않게 발송될 수 있고, 비동기 /send 에는
         *     걸려 있는 AI 예산 게이트도 이 경로에만 빠져 있어 집계를 우회할 수 있었다.
         *     관리자만 호출하도록 제한한다.
         */
        post: operations["send_report_sync_api_report_mail_send_sync_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/flags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Flags */
        get: operations["get_flags_api_settings_flags_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Healthz
         * @description DB까지 확인하는 헬스체크. 실패 시 503.
         */
        get: operations["healthz_healthz_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AIProviderStatus */
        AIProviderStatus: {
            /** Api Key Configured */
            api_key_configured: boolean;
            /** Is Active */
            is_active: boolean;
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Model */
            model: string;
        };
        /** AIStatusOut */
        AIStatusOut: {
            /** Active Provider */
            active_provider: string;
            /** Providers */
            providers: components["schemas"]["AIProviderStatus"][];
        };
        /** AIToolUsageLogListResponse */
        AIToolUsageLogListResponse: {
            /** Items */
            items: components["schemas"]["AIToolUsageLogOut"][];
            /** Total */
            total: number;
        };
        /** AIToolUsageLogOut */
        AIToolUsageLogOut: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: number;
            /** Image Filename */
            image_filename: string;
            /** Output Tokens */
            output_tokens?: number | null;
            /** Prompt */
            prompt: string;
            /** Prompt Tokens */
            prompt_tokens?: number | null;
            /** Tool */
            tool: string;
            /** Total Tokens */
            total_tokens?: number | null;
            /** User Email */
            user_email: string;
            /** User Id */
            user_id: number;
        };
        /** AIUsageBudgetUpdate */
        AIUsageBudgetUpdate: {
            /** Monthly Token Budget */
            monthly_token_budget: number;
        };
        /** AIUsageSummaryResponse */
        AIUsageSummaryResponse: {
            /** By Tool */
            by_tool: {
                [key: string]: number;
            };
            /** Month */
            month: string;
            /** Monthly Token Budget */
            monthly_token_budget: number;
            /** Total Tokens */
            total_tokens: number;
        };
        /** AccessTokenResponse */
        AccessTokenResponse: {
            /** Access Token */
            access_token: string;
            /**
             * Token Type
             * @default bearer
             */
            token_type: string;
        };
        /** AdminIssueRequest */
        AdminIssueRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Name
             * @default
             */
            name: string;
            /** Password */
            password: string;
        };
        /** AlertLogListResponse */
        AlertLogListResponse: {
            /** Items */
            items: components["schemas"]["AlertLogOut"][];
            /** Total */
            total: number;
        };
        /** AlertLogOut */
        AlertLogOut: {
            /**
             * Alert Type
             * @enum {string}
             */
            alert_type: "drop" | "recovered";
            /** Breach Streak */
            breach_streak: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Curr Rank */
            curr_rank: number | null;
            /**
             * Device
             * @enum {string}
             */
            device: "all" | "pc" | "mobile";
            /** Error Msg */
            error_msg: string | null;
            /** Id */
            id: number;
            /** Keyword */
            keyword: string;
            /** Prev Rank */
            prev_rank: number | null;
            /** Recipients */
            recipients: string;
            /**
             * Status
             * @enum {string}
             */
            status: "sent" | "error";
            /** Target Rank */
            target_rank: number;
            /** Watch Id */
            watch_id: number | null;
        };
        /**
         * AlertSummary
         * @description 적재·평가 직후의 알림 결과 — 화면이 "알림이 나갔는지"를 바로 알 수 있게.
         */
        AlertSummary: {
            /**
             * Drops
             * @default 0
             */
            drops: number;
            /**
             * Recoveries
             * @default 0
             */
            recoveries: number;
            /**
             * Sent
             * @default false
             */
            sent: boolean;
            /** Skipped Reason */
            skipped_reason?: string | null;
        };
        /** AuditLogListResponse */
        AuditLogListResponse: {
            /** Items */
            items: components["schemas"]["AuditLogOut"][];
            /** Total */
            total: number;
        };
        /** AuditLogOut */
        AuditLogOut: {
            /** Action */
            action: string;
            /** Actor Email */
            actor_email: string;
            /** Actor Role */
            actor_role: string;
            /** Actor User Id */
            actor_user_id: number;
            /** Company Id */
            company_id: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Detail */
            detail: {
                [key: string]: unknown;
            };
            /** Id */
            id: number;
            /** Target Id */
            target_id: string;
            /** Target Type */
            target_type: string;
        };
        /**
         * BackgroundStyle
         * @description 선택 화면에 뿌릴 스타일 목록 한 줄 (서버가 단일 출처).
         */
        BackgroundStyle: {
            /** Key */
            key: string;
            /** Label */
            label: string;
        };
        /** BackgroundSuggestion */
        BackgroundSuggestion: {
            /** Variants */
            variants: components["schemas"]["BackgroundVariant"][];
        };
        /** BackgroundVariant */
        BackgroundVariant: {
            /** Image Base64 */
            image_base64: string;
            /** Label */
            label: string;
            /** Mime */
            mime: string;
            /** Style */
            style: string;
        };
        /** BidEstimateResponse */
        BidEstimateResponse: {
            /**
             * Device
             * @enum {string}
             */
            device: "all" | "pc" | "mobile";
            /** Keyword */
            keyword: string;
            /** Rows */
            rows: components["schemas"]["BidRowOut"][];
            /** Skipped Reason */
            skipped_reason?: string | null;
            /** Target Rank */
            target_rank: number;
        };
        /** BidRowOut */
        BidRowOut: {
            /** Mobile */
            mobile: number | null;
            /** Pc */
            pc: number | null;
            /** Position */
            position: number;
        };
        /** Body_analyze_endpoint_api_image_filter_analyze_post */
        Body_analyze_endpoint_api_image_filter_analyze_post: {
            /**
             * File
             * @description 분석할 이미지
             */
            file: string;
        };
        /** Body_backgrounds_endpoint_api_image_filter_backgrounds_post */
        Body_backgrounds_endpoint_api_image_filter_backgrounds_post: {
            /**
             * Custom
             * @description 직접 입력한 배경 묘사 (줄바꿈 구분)
             * @default
             */
            custom: string;
            /**
             * File
             * @description 배경 시안을 만들 이미지
             */
            file: string;
            /**
             * Styles
             * @description 생성할 스타일 키 (쉼표 구분, 비우면 전체)
             * @default
             */
            styles: string;
        };
        /** Body_batch_endpoint_api_image_resize_batch_post */
        Body_batch_endpoint_api_image_resize_batch_post: {
            /**
             * File
             * @description 변환할 이미지
             */
            file: string;
            /**
             * Format
             * @description 출력 포맷: jpeg | png | webp
             * @default jpeg
             */
            format: string;
            /**
             * Presets
             * @description 프리셋 키 목록 (쉼표 구분)
             */
            presets: string;
        };
        /** Body_edit_endpoint_api_image_filter_edit_post */
        Body_edit_endpoint_api_image_filter_edit_post: {
            /**
             * File
             * @description 편집할 이미지
             */
            file: string;
            /**
             * Format
             * @description 출력 포맷: jpeg | png | webp
             * @default jpeg
             */
            format: string;
            /**
             * Height
             * @description 목표 세로 (px)
             */
            height?: number | null;
            /**
             * Prompt
             * @description AI 편집 프롬프트
             */
            prompt: string;
            /**
             * Width
             * @description 목표 가로 (px)
             */
            width?: number | null;
        };
        /** Body_export_excel_api_marketing_export_post */
        Body_export_excel_api_marketing_export_post: {
            /** Files */
            files: string[];
        };
        /** Body_list_excel_periods_api_marketing_excel_periods_post */
        Body_list_excel_periods_api_marketing_excel_periods_post: {
            /** File */
            file: string;
        };
        /** Body_load_excel_api_marketing_load_excel_post */
        Body_load_excel_api_marketing_load_excel_post: {
            /** File */
            file: string;
        };
        /** Body_parse_keyword_compare_api_keyword_compare_parse_post */
        Body_parse_keyword_compare_api_keyword_compare_parse_post: {
            /** File */
            file: string;
        };
        /** Body_preview_report_api_marketing_preview_post */
        Body_preview_report_api_marketing_preview_post: {
            /** Files */
            files: string[];
        };
        /** Body_resize_endpoint_api_image_resize_resize_post */
        Body_resize_endpoint_api_image_resize_resize_post: {
            /**
             * File
             * @description 리사이즈할 이미지
             */
            file: string;
            /**
             * Format
             * @description 출력 포맷: jpeg | png | webp
             * @default jpeg
             */
            format: string;
            /**
             * Height
             * @description 목표 세로 (px)
             */
            height?: number | null;
            /**
             * Use Ai Upscale
             * @description 확대 시 AI 업스케일 사용 여부
             * @default false
             */
            use_ai_upscale: boolean;
            /**
             * Width
             * @description 목표 가로 (px)
             */
            width?: number | null;
        };
        /** Body_save_excel_data_api_marketing_save_excel_data_post */
        Body_save_excel_data_api_marketing_save_excel_data_post: {
            /** File */
            file: string;
        };
        /** Body_start_save_excel_task_api_marketing_save_excel_task_post */
        Body_start_save_excel_task_api_marketing_save_excel_task_post: {
            /** File */
            file: string;
        };
        /** Body_suggest_headings_api_heading_suggest_post */
        Body_suggest_headings_api_heading_suggest_post: {
            /**
             * File
             * @description 분석할 마케팅 이미지
             */
            file: string;
            /**
             * Platform
             * @description 이 플랫폼 문구만 생성
             */
            platform?: ("Instagram" | "Blog" | "YouTube") | null;
            /**
             * Record Id
             * @description 재생성 결과를 병합할 기존 기록 ID
             */
            record_id?: number | null;
        };
        /** Body_upload_files_api_marketing_upload_post */
        Body_upload_files_api_marketing_upload_post: {
            /** Files */
            files: string[];
        };
        /** Body_upload_snapshot_report_api_rank_monitor_snapshots_upload_post */
        Body_upload_snapshot_report_api_rank_monitor_snapshots_upload_post: {
            /** File */
            file: string;
            /**
             * Stat Date
             * Format: date
             * @description 보고서가 집계된 날짜 (YYYY-MM-DD)
             */
            stat_date: string;
        };
        /**
         * BudgetRow
         * @description summary 시트 ■ 매체별 예산 표의 한 줄.
         */
        BudgetRow: {
            /**
             * Budget
             * @default 0
             */
            budget: number;
            /**
             * Burn Rate
             * @default 0
             */
            burn_rate: number;
            /** Category */
            category: string;
            /**
             * Clicks
             * @default 0
             */
            clicks: number;
            /**
             * Conv Cost
             * @default 0
             */
            conv_cost: number;
            /**
             * Conv Rate
             * @default 0
             */
            conv_rate: number;
            /**
             * Cost Vat
             * @default 0
             */
            cost_vat: number;
            /**
             * Impressions
             * @default 0
             */
            impressions: number;
            /**
             * Spent
             * @default 0
             */
            spent: number;
            /**
             * Total Conv
             * @default 0
             */
            total_conv: number;
        };
        /**
         * CollectResponse
         * @description API 자동 수집 결과 — 화면이 "받아왔는지"를 바로 알 수 있게.
         */
        CollectResponse: {
            alerts: components["schemas"]["AlertSummary"];
            /** Collected */
            collected: number;
            /** Not Found */
            not_found: string[];
            /** Resolved */
            resolved: number;
            /** Skipped Reason */
            skipped_reason: string | null;
            /**
             * Stat Date
             * Format: date
             */
            stat_date: string;
        };
        /**
         * CollectStatus
         * @description 수집기 설정 상태 — 화면이 안내 문구를 고르는 데 쓴다.
         */
        CollectStatus: {
            /** Configured */
            configured: boolean;
            /** Message */
            message: string;
        };
        /** CompanyActiveUpdate */
        CompanyActiveUpdate: {
            /** Is Active */
            is_active: boolean;
        };
        /** CompanyBudgetUpdate */
        CompanyBudgetUpdate: {
            /** Monthly Token Budget */
            monthly_token_budget: number;
        };
        /** CompanyCreate */
        CompanyCreate: {
            /** Name */
            name: string;
        };
        /** CompanyListResponse */
        CompanyListResponse: {
            /** Items */
            items: components["schemas"]["CompanyOut"][];
            /** Total */
            total: number;
        };
        /** CompanyOut */
        CompanyOut: {
            /** Admin Email */
            admin_email?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Expires At */
            expires_at: string | null;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /** Is Trial */
            is_trial: boolean;
            /**
             * Month Tokens Used
             * @default 0
             */
            month_tokens_used: number;
            /**
             * Monthly Token Budget
             * @default 0
             */
            monthly_token_budget: number;
            /** Name */
            name: string;
            /**
             * User Count
             * @default 0
             */
            user_count: number;
        };
        /**
         * ComparePeriod
         * @description 기간 비교(MoM·YoY)용 다른 달의 전체 합계. 그 달 데이터가 없으면 응답에서 None.
         */
        ComparePeriod: {
            /** Label */
            label: string;
            /** Month */
            month: number;
            total: components["schemas"]["MediaSummary"];
            /** Year */
            year: number;
        };
        /** CompareResult */
        CompareResult: {
            /** Sheets */
            sheets: components["schemas"]["CompareSheet"][];
            /** Skipped Sheets */
            skipped_sheets: components["schemas"]["SkippedSheet"][];
        };
        /** CompareRow */
        CompareRow: {
            /** Campaign Type */
            campaign_type: string;
            /** Conv Type */
            conv_type: string;
            /** Curr Amount */
            curr_amount: number;
            /** Curr Conv */
            curr_conv: number;
            /** Device */
            device: string;
            /** Diff Amount */
            diff_amount: number;
            /** Diff Conv */
            diff_conv: number;
            /** Keyword */
            keyword: string;
            /** Prev Amount */
            prev_amount: number;
            /** Prev Conv */
            prev_conv: number;
            /**
             * Status
             * @enum {string}
             */
            status: "new" | "gone" | "up" | "down" | "same";
        };
        /** CompareSheet */
        CompareSheet: {
            /** Campaign Types */
            campaign_types: string[];
            /** Conv Types */
            conv_types: string[];
            /** Devices */
            devices: string[];
            /** Name */
            name: string;
            /** Period */
            period: string;
            /** Rows */
            rows: components["schemas"]["CompareRow"][];
            summary: components["schemas"]["SheetSummary"];
        };
        /**
         * DailyTotalRow
         * @description summary 시트 하단 일별 합계 한 줄.
         */
        DailyTotalRow: {
            /**
             * Clicks
             * @default 0
             */
            clicks: number;
            /**
             * Conv Cost
             * @default 0
             */
            conv_cost: number;
            /**
             * Conv Rate
             * @default 0
             */
            conv_rate: number;
            /**
             * Cost
             * @default 0
             */
            cost: number;
            /**
             * Cpc
             * @default 0
             */
            cpc: number;
            /**
             * Ctr
             * @default 0
             */
            ctr: number;
            /** Date */
            date: string;
            /**
             * Impressions
             * @default 0
             */
            impressions: number;
            /**
             * Total Conv
             * @default 0
             */
            total_conv: number;
        };
        /** DevUserActiveUpdate */
        DevUserActiveUpdate: {
            /** Is Active */
            is_active: boolean;
        };
        /** DevUserCreate */
        DevUserCreate: {
            /** Company Id */
            company_id: number;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Name
             * @default
             */
            name: string;
            /** Password */
            password: string;
            /**
             * Role
             * @default member
             * @enum {string}
             */
            role: "member" | "admin" | "trial";
        };
        /** DevUserOut */
        DevUserOut: {
            /** Company Id */
            company_id: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /** Locked Until */
            locked_until?: string | null;
            /** Name */
            name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "dev" | "admin" | "member" | "trial";
        };
        /** DevUserPasswordReset */
        DevUserPasswordReset: {
            /** New Password */
            new_password: string;
        };
        /** DevUserProfileUpdate */
        DevUserProfileUpdate: {
            /** Email */
            email?: string | null;
            /** Name */
            name?: string | null;
        };
        /** DevUserRoleUpdate */
        DevUserRoleUpdate: {
            /**
             * Role
             * @enum {string}
             */
            role: "member" | "admin" | "trial";
        };
        /** ElementAnalysis */
        ElementAnalysis: {
            /** Elements */
            elements: components["schemas"]["ImageElement"][];
        };
        /**
         * ElementBox
         * @description 0~1 비율 좌표 — 프런트가 CSS 퍼센트로 바로 쓸 수 있는 형태.
         */
        ElementBox: {
            /** H */
            h: number;
            /** W */
            w: number;
            /** X */
            x: number;
            /** Y */
            y: number;
        };
        /**
         * ExcelPeriodListResponse
         * @description /excel-periods 응답.
         *
         *     예전에는 `-> dict` 로 열려 있어 OpenAPI 에 모양이 실리지 않았고, 프런트가 같은
         *     구조를 손으로 적어 두고 있었다 — 키 이름이 갈려도 아무도 알아채지 못하는 구조다.
         */
        ExcelPeriodListResponse: {
            /** Periods */
            periods: components["schemas"]["ExcelPeriodSummary"][];
        };
        /**
         * ExcelPeriodSummary
         * @description 업로드 모달의 기간 선택 화면에 필요한 최소 정보.
         */
        ExcelPeriodSummary: {
            /** Comment */
            comment: string;
            /**
             * Days
             * @description 실적이 들어 있는 일수 — 목록의 'N일' 배지
             */
            days: number;
            /** Period */
            period: string;
        };
        /**
         * ExcelReport
         * @description 한 기간(월)의 리포트 전체.
         */
        ExcelReport: {
            /** Budget Table */
            budget_table: components["schemas"]["BudgetRow"][];
            /** Comment */
            comment: string;
            /** Daily Total */
            daily_total: components["schemas"]["DailyTotalRow"][];
            /** Media */
            media: {
                [key: string]: components["schemas"]["MediaSheetData"];
            };
            /** Period */
            period: string;
            period_info: components["schemas"]["PeriodInfo"];
            sa_total: components["schemas"]["SaTotal"];
        };
        /**
         * ExcelReportBundle
         * @description /load-excel 응답 — 한 파일에 5월·6월이 있으면 달마다 리포트가 하나씩.
         */
        ExcelReportBundle: {
            /** Periods */
            periods: string[];
            /** Reports */
            reports: components["schemas"]["ExcelReport"][];
        };
        /** FeatureFlagOut */
        FeatureFlagOut: {
            /** Description */
            description: string;
            /**
             * Key
             * @enum {string}
             */
            key: "is_dashboard_enabled" | "is_report_email_enabled" | "is_keyword_compare_enabled" | "is_image_filter_enabled" | "is_image_resize_enabled" | "is_heading_suggest_enabled" | "is_rank_monitor_enabled";
            /** Value */
            value: boolean;
        };
        /** FeatureFlagUpdate */
        FeatureFlagUpdate: {
            /** Value */
            value: boolean;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HeadingHistoryResponse */
        HeadingHistoryResponse: {
            /** Items */
            items: components["schemas"]["HeadingSuggestionRecord"][];
            /**
             * Total
             * @default 0
             */
            total: number;
        };
        /** HeadingItem */
        HeadingItem: {
            /** Desc */
            desc: string;
            /** Id */
            id: number;
            /**
             * Platform
             * @enum {string}
             */
            platform: "Instagram" | "Blog" | "YouTube";
            /** Text */
            text: string;
        };
        /**
         * HeadingSuggestionRecord
         * @description DB에 저장된 한 번의 문구 생성 결과.
         */
        HeadingSuggestionRecord: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Has Image */
            has_image: boolean;
            /** Headings */
            headings: components["schemas"]["HeadingItem"][];
            /** Id */
            id: number;
            /** Image Filename */
            image_filename: string;
        };
        /** ImageElement */
        ImageElement: {
            box: components["schemas"]["ElementBox"];
            /** Category */
            category: string;
            /** Id */
            id: number;
            /** Label */
            label: string;
        };
        /**
         * KeywordInsightResponse
         * @description 키워드 경쟁 지표 — 목표 순위가 현실적인지 판단할 근거.
         */
        KeywordInsightResponse: {
            /** Ad Depth */
            ad_depth?: number | null;
            /** Competition */
            competition?: string | null;
            /** Ctr Mobile */
            ctr_mobile?: number | null;
            /** Ctr Pc */
            ctr_pc?: number | null;
            /** Keyword */
            keyword: string;
            /**
             * Mobile Low Volume
             * @default false
             */
            mobile_low_volume: boolean;
            /** Monthly Mobile */
            monthly_mobile?: number | null;
            /** Monthly Pc */
            monthly_pc?: number | null;
            /**
             * Pc Low Volume
             * @default false
             */
            pc_low_volume: boolean;
            /** Skipped Reason */
            skipped_reason?: string | null;
        };
        /** LogResponse */
        LogResponse: {
            /** Created At */
            created_at: string;
            /** Curr Month */
            curr_month: number;
            /** Curr Year */
            curr_year: number;
            /** Error Msg */
            error_msg: string | null;
            /** Id */
            id: number;
            /** Prev Month */
            prev_month: number;
            /** Prev Year */
            prev_year: number;
            /** Recipients */
            recipients: string;
            /** Status */
            status: string;
            /** Subject */
            subject: string;
        };
        /** MediaBudgetsResponse */
        MediaBudgetsResponse: {
            /** Budgets */
            budgets: {
                [key: string]: number;
            };
            /** Inherited From */
            inherited_from?: string | null;
            /**
             * Media
             * @description 예산을 입력할 수 있는 매체 목록
             */
            media: string[];
            /** Month */
            month: number;
            /** Year */
            year: number;
        };
        /** MediaBudgetsUpdate */
        MediaBudgetsUpdate: {
            /** Budgets */
            budgets: {
                [key: string]: number;
            };
        };
        /** MediaDailyRow */
        MediaDailyRow: {
            /** Apply */
            apply: number;
            /** Clicks */
            clicks: number;
            /** Conv Cost */
            conv_cost: number;
            /** Conv Rate */
            conv_rate: number;
            /** Cost */
            cost: number;
            /** Cpc */
            cpc: number;
            /** Ctr */
            ctr: number;
            /** Date */
            date: string;
            /** Impressions */
            impressions: number;
            /** Purchase */
            purchase: number;
            /** Revenue */
            revenue: number;
            /** Roas */
            roas: number;
            /** Signup */
            signup: number;
            /** Total Conv */
            total_conv: number;
        };
        /** MediaPreset */
        MediaPreset: {
            /** Height */
            height: number;
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Media */
            media: string;
            /** Width */
            width: number;
        };
        /**
         * MediaSheetData
         * @description 매체 시트 — 헤더와 값 행들을 화면이 그대로 표로 그린다.
         *
         *     셀 값 타입은 고정하지 않는다(Any). 이 계약의 목적은 키가 빠지거나 이름이 바뀌는
         *     구조적 드리프트를 잡는 것이지 셀 타입을 단속하는 게 아니고, openpyxl 은 수식 칸에서
         *     bool·Decimal 같은 값도 돌려주기 때문이다 — 타입을 좁히면 멀쩡한 파일이 500 이 된다.
         */
        MediaSheetData: {
            /** Daily */
            daily: unknown[][];
            /** Headers */
            headers: string[];
            /** Total */
            total: unknown[];
        };
        /** MediaSummary */
        MediaSummary: {
            /** Apply */
            apply: number;
            /** Clicks */
            clicks: number;
            /** Cost */
            cost: number;
            /** Cpc */
            cpc: number;
            /** Ctr */
            ctr: number;
            /** Impressions */
            impressions: number;
            /** Label */
            label: string;
            /** Purchase */
            purchase: number;
            /** Revenue */
            revenue: number;
            /** Roas */
            roas: number;
            /** Signup */
            signup: number;
            /** Total Conv */
            total_conv: number;
        };
        /** PasswordChange */
        PasswordChange: {
            /** Current Password */
            current_password: string;
            /** New Password */
            new_password: string;
        };
        /** PeriodDeleteResponse */
        PeriodDeleteResponse: {
            /** Deleted Excel */
            deleted_excel: boolean;
            /** Deleted Meta */
            deleted_meta: boolean;
            /** Deleted Rows */
            deleted_rows: number;
            /** Message */
            message: string;
            /** Month */
            month: number;
            /** Year */
            year: number;
        };
        /**
         * PeriodInfo
         * @description summary 시트 3행 — 기간 진행 상황.
         */
        PeriodInfo: {
            /** Elapsed Days */
            elapsed_days: number;
            /** Remaining Days */
            remaining_days: number;
            /** Total Days */
            total_days: number;
        };
        /** PeriodOverviewItem */
        PeriodOverviewItem: {
            /** Comment Updated At */
            comment_updated_at?: string | null;
            /** First Date */
            first_date?: string | null;
            /**
             * Has Budget
             * @default false
             */
            has_budget: boolean;
            /** Has Comment */
            has_comment: boolean;
            /** Has Excel */
            has_excel: boolean;
            /** Last Date */
            last_date?: string | null;
            /** Month */
            month: number;
            /** Row Count */
            row_count: number;
            /** Year */
            year: number;
        };
        /** PeriodOverviewResponse */
        PeriodOverviewResponse: {
            /** Items */
            items: components["schemas"]["PeriodOverviewItem"][];
            /** Total Rows */
            total_rows: number;
        };
        /** PreviewReportRequest */
        PreviewReportRequest: {
            /** Curr Month */
            curr_month: number;
            /** Curr Year */
            curr_year: number;
            /** Prev Month */
            prev_month: number;
            /** Prev Year */
            prev_year: number;
            /**
             * Subject
             * @default
             */
            subject: string;
        };
        /** PreviewReportResponse */
        PreviewReportResponse: {
            /** Comment */
            comment: string;
            /** Html */
            html: string;
            /** Subject */
            subject: string;
        };
        /** ProfileUpdate */
        ProfileUpdate: {
            /** Email */
            email?: string | null;
            /** Name */
            name?: string | null;
        };
        /** RefreshRequest */
        RefreshRequest: {
            /** Refresh Token */
            refresh_token: string;
        };
        /** ReportLogListResponse */
        ReportLogListResponse: {
            /** Counts */
            counts: {
                [key: string]: number;
            };
            /** Items */
            items: components["schemas"]["ReportLogOut"][];
            /** Total */
            total: number;
        };
        /** ReportLogOut */
        ReportLogOut: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Curr Month */
            curr_month: number;
            /** Curr Year */
            curr_year: number;
            /** Error Msg */
            error_msg?: string | null;
            /** Id */
            id: number;
            /** Prev Month */
            prev_month: number;
            /** Prev Year */
            prev_year: number;
            /** Recipients */
            recipients: string;
            /** Status */
            status: string;
            /** Subject */
            subject: string;
        };
        /** ReportResendResponse */
        ReportResendResponse: {
            log: components["schemas"]["ReportLogOut"];
            /** Recipients */
            recipients: string[];
            /** Status */
            status: string;
        };
        /** ReportResponse */
        ReportResponse: {
            /** By Media */
            by_media: components["schemas"]["MediaSummary"][];
            /**
             * Comment
             * @default
             */
            comment: string;
            /** Comment Updated At */
            comment_updated_at?: string | null;
            compare_mom?: components["schemas"]["ComparePeriod"] | null;
            compare_yoy?: components["schemas"]["ComparePeriod"] | null;
            /** Daily */
            daily: {
                [key: string]: components["schemas"]["MediaDailyRow"][];
            };
            /**
             * Diff
             * @default {}
             */
            diff: {
                [key: string]: components["schemas"]["RowDiff"];
            };
            /** Period */
            period: string;
            total: components["schemas"]["MediaSummary"];
            /**
             * Undo Id
             * @default
             */
            undo_id: string;
        };
        /** RowDiff */
        RowDiff: {
            /**
             * Added
             * @default []
             */
            added: string[];
            /**
             * Updated
             * @default []
             */
            updated: string[];
        };
        /** RowUpsertBody */
        RowUpsertBody: {
            /**
             * Apply
             * @default 0
             */
            apply: number;
            /** Campaign Type */
            campaign_type: string;
            /**
             * Clicks
             * @default 0
             */
            clicks: number;
            /**
             * Conversion Revenue
             * @default 0
             */
            conversion_revenue: number;
            /**
             * Conversions
             * @default 0
             */
            conversions: number;
            /**
             * Cost
             * @default 0
             */
            cost: number;
            /**
             * Impressions
             * @default 0
             */
            impressions: number;
            /**
             * Purchase
             * @default 0
             */
            purchase: number;
            /** Report Date */
            report_date: string;
            /**
             * Signup
             * @default 0
             */
            signup: number;
        };
        /** SaTotal */
        SaTotal: {
            /** Headers */
            headers: string[];
            /** Rows */
            rows: components["schemas"]["SaTotalRow"][];
        };
        /**
         * SaTotalRow
         * @description 전년/전월/당월/YOY/MOM/전주/금주/WoW 비교 행 (SA_TOTAL_COLS 와 같은 순서).
         */
        SaTotalRow: {
            /**
             * Clicks
             * @default 0
             */
            clicks: number;
            /**
             * Conv Cost
             * @default 0
             */
            conv_cost: number;
            /**
             * Conv Cost Ex
             * @default 0
             */
            conv_cost_ex: number;
            /**
             * Conv Rate
             * @default 0
             */
            conv_rate: number;
            /**
             * Conv Rate Ex
             * @default 0
             */
            conv_rate_ex: number;
            /**
             * Cost Markup
             * @default 0
             */
            cost_markup: number;
            /**
             * Cost Vat
             * @default 0
             */
            cost_vat: number;
            /**
             * Cpc
             * @default 0
             */
            cpc: number;
            /**
             * Ctr
             * @default 0
             */
            ctr: number;
            /**
             * Date
             * @default
             */
            date: string;
            /**
             * Impressions
             * @default 0
             */
            impressions: number;
            /** Label */
            label: string;
            /**
             * Purchase
             * @default 0
             */
            purchase: number;
            /**
             * Purchase Rate
             * @default 0
             */
            purchase_rate: number;
            /**
             * Revenue
             * @default 0
             */
            revenue: number;
            /**
             * Revenue Per Purchase
             * @default 0
             */
            revenue_per_purchase: number;
            /**
             * Roas
             * @default 0
             */
            roas: number;
            /**
             * Signup
             * @default 0
             */
            signup: number;
            /**
             * Signup Rate
             * @default 0
             */
            signup_rate: number;
            /**
             * Total Conv
             * @default 0
             */
            total_conv: number;
            /**
             * Total Conv Ex
             * @default 0
             */
            total_conv_ex: number;
        };
        /** SendReportRequest */
        SendReportRequest: {
            /** Curr Month */
            curr_month: number;
            /** Curr Year */
            curr_year: number;
            /** Prev Month */
            prev_month: number;
            /** Prev Year */
            prev_year: number;
            /** Recipients */
            recipients: string[];
            /**
             * Subject
             * @default
             */
            subject: string;
        };
        /** SheetSummary */
        SheetSummary: {
            /** Count Down */
            count_down: number;
            /** Count Gone */
            count_gone: number;
            /** Count New */
            count_new: number;
            /** Count Same */
            count_same: number;
            /** Count Up */
            count_up: number;
            /** Diff Amount */
            diff_amount: number;
            /** Diff Conv */
            diff_conv: number;
            /** Total Curr Amount */
            total_curr_amount: number;
            /** Total Curr Conv */
            total_curr_conv: number;
            /** Total Prev Amount */
            total_prev_amount: number;
            /** Total Prev Conv */
            total_prev_conv: number;
        };
        /** SkippedSheet */
        SkippedSheet: {
            /** Name */
            name: string;
            /**
             * Reason
             * @description 건너뛴 이유 — 화면이 그대로 보여 준다
             */
            reason: string;
        };
        /** SnapshotOut */
        SnapshotOut: {
            /** Avg Rank */
            avg_rank: number | null;
            /** Clicks */
            clicks: number;
            /** Collected At */
            collected_at?: string | null;
            /** Impressions */
            impressions: number;
            /**
             * Source
             * @enum {string}
             */
            source: "upload" | "api";
            /**
             * Stat Date
             * Format: date
             */
            stat_date: string;
        };
        /** SnapshotUploadResponse */
        SnapshotUploadResponse: {
            alerts: components["schemas"]["AlertSummary"];
            /** Inserted */
            inserted: number;
            /** Matched Watches */
            matched_watches: number;
            /**
             * Stat Date
             * Format: date
             */
            stat_date: string;
            /** Unmatched Keywords */
            unmatched_keywords: string[];
            /** Updated */
            updated: number;
            /** Watches No Data */
            watches_no_data: string[];
        };
        /**
         * TaskStatus
         * @enum {string}
         */
        TaskStatus: "pending" | "processing" | "completed" | "failed";
        /** TaskStatusResponse */
        TaskStatusResponse: {
            /** Ai Comment */
            ai_comment?: string | null;
            /** Error */
            error?: string | null;
            /** Processed Rows */
            processed_rows?: number | null;
            status: components["schemas"]["TaskStatus"];
            /** Task Id */
            task_id: string;
        };
        /** TokenResponse */
        TokenResponse: {
            /** Access Token */
            access_token: string;
            /** Refresh Token */
            refresh_token: string;
            /**
             * Token Type
             * @default bearer
             */
            token_type: string;
            user: components["schemas"]["UserOut"];
        };
        /** TrialCreate */
        TrialCreate: {
            /** Company Name */
            company_name?: string | null;
            /**
             * Days
             * @description 만료까지 일수 (미지정 시 서버 기본값)
             */
            days?: number | null;
            /** Email */
            email?: string | null;
            /** Password */
            password?: string | null;
        };
        /** TrialExtend */
        TrialExtend: {
            /**
             * Days
             * @description 지금부터 며칠 더 열어둘지
             */
            days: number;
        };
        /** TrialOut */
        TrialOut: {
            /** Company Id */
            company_id: number;
            /** Company Name */
            company_name: string;
            /** Email */
            email: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /** Password */
            password: string;
        };
        /** UploadTaskResponse */
        UploadTaskResponse: {
            /** Message */
            message: string;
            status: components["schemas"]["TaskStatus"];
            /** Task Id */
            task_id: string;
        };
        /** UserActiveUpdate */
        UserActiveUpdate: {
            /** Is Active */
            is_active: boolean;
        };
        /** UserAdminCreate */
        UserAdminCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Name
             * @default
             */
            name: string;
            /** Password */
            password: string;
            /**
             * Role
             * @default member
             * @enum {string}
             */
            role: "dev" | "admin" | "member" | "trial";
        };
        /** UserAdminOut */
        UserAdminOut: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /** Name */
            name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "dev" | "admin" | "member" | "trial";
        };
        /** UserCreate */
        UserCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Name
             * @default
             */
            name: string;
            /** Password */
            password: string;
        };
        /** UserLogin */
        UserLogin: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
        };
        /** UserOut */
        UserOut: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Id */
            id: number;
            /** Name */
            name: string;
            /**
             * Role
             * @enum {string}
             */
            role: "dev" | "admin" | "member" | "trial";
        };
        /** UserPasswordReset */
        UserPasswordReset: {
            /** New Password */
            new_password: string;
        };
        /** UserProfileUpdate */
        UserProfileUpdate: {
            /** Email */
            email?: string | null;
            /** Name */
            name?: string | null;
        };
        /** UserRoleUpdate */
        UserRoleUpdate: {
            /**
             * Role
             * @enum {string}
             */
            role: "dev" | "admin" | "member" | "trial";
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** WatchBulkCreateRequest */
        WatchBulkCreateRequest: {
            /** Items */
            items: components["schemas"]["WatchCreateItem"][];
        };
        /** WatchBulkCreateResponse */
        WatchBulkCreateResponse: {
            /** Created */
            created: number;
            /** Errors */
            errors: number;
            /** Results */
            results: components["schemas"]["WatchCreateResult"][];
            /** Skipped */
            skipped: number;
        };
        /** WatchCreateItem */
        WatchCreateItem: {
            /**
             * Alert On No Impression
             * @default true
             */
            alert_on_no_impression: boolean;
            /**
             * Breaches Required
             * @default 2
             */
            breaches_required: number;
            /** Color Tag */
            color_tag?: string | null;
            /**
             * Cooldown Hours
             * @default 24
             */
            cooldown_hours: number;
            /**
             * Device
             * @default all
             * @enum {string}
             */
            device: "all" | "pc" | "mobile";
            /** Keyword */
            keyword: string;
            /**
             * Target Rank
             * @default 3
             */
            target_rank: number;
            /**
             * Tolerance
             * @default 0.5
             */
            tolerance: number;
        };
        /**
         * WatchCreateResult
         * @description 행별 결과 — 일부 실패해도 전체를 되돌리지 않고 사유를 행 단위로 알린다.
         */
        WatchCreateResult: {
            /**
             * Device
             * @enum {string}
             */
            device: "all" | "pc" | "mobile";
            /** Id */
            id?: number | null;
            /** Keyword */
            keyword: string;
            /** Reason */
            reason?: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "created" | "skipped" | "error";
        };
        /** WatchDeleteResponse */
        WatchDeleteResponse: {
            /** Id */
            id: number;
            /** Message */
            message: string;
        };
        /** WatchHistoryResponse */
        WatchHistoryResponse: {
            /** Items */
            items: components["schemas"]["SnapshotOut"][];
            watch: components["schemas"]["WatchOut"];
        };
        /** WatchListResponse */
        WatchListResponse: {
            /** Items */
            items: components["schemas"]["WatchOut"][];
            /** Total */
            total: number;
        };
        /** WatchOut */
        WatchOut: {
            /** Alert On No Impression */
            alert_on_no_impression: boolean;
            /** Alerted */
            alerted: boolean;
            /** Breach Streak */
            breach_streak: number;
            /** Breaches Required */
            breaches_required: number;
            /** Color Tag */
            color_tag: string | null;
            /** Cooldown Hours */
            cooldown_hours: number;
            /**
             * Device
             * @enum {string}
             */
            device: "all" | "pc" | "mobile";
            /** Id */
            id: number;
            /** Is Breached */
            is_breached: boolean;
            /** Keyword */
            keyword: string;
            /** Last Alerted At */
            last_alerted_at: string | null;
            /** Last Checked At */
            last_checked_at: string | null;
            /** Last Error Code */
            last_error_code?: string | null;
            /** Last Error Message */
            last_error_message?: string | null;
            latest?: components["schemas"]["SnapshotOut"] | null;
            /**
             * Nv Linked
             * @default false
             */
            nv_linked: boolean;
            /** Nv Synced At */
            nv_synced_at?: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "active" | "paused";
            /** Target Rank */
            target_rank: number;
            /** Tolerance */
            tolerance: number;
        };
        /**
         * WatchUpdate
         * @description 부분 수정 — 보낸 필드만 반영한다.
         */
        WatchUpdate: {
            /** Alert On No Impression */
            alert_on_no_impression?: boolean | null;
            /** Breaches Required */
            breaches_required?: number | null;
            /** Color Tag */
            color_tag?: string | null;
            /** Cooldown Hours */
            cooldown_hours?: number | null;
            /** Status */
            status?: ("active" | "paused") | null;
            /** Target Rank */
            target_rank?: number | null;
            /** Tolerance */
            tolerance?: number | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    read_root__get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_ai_status_api_admin_ai_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AIStatusOut"];
                };
            };
        };
    };
    list_ai_usage_logs_api_admin_ai_usage_logs_get: {
        parameters: {
            query?: {
                /** @description image_filter | image_resize | heading_suggest */
                tool?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AIToolUsageLogListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_usage_budget_api_admin_ai_usage_logs_budget_patch: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AIUsageBudgetUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AIUsageSummaryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_usage_summary_api_admin_ai_usage_logs_summary_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AIUsageSummaryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_periods_api_admin_periods_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PeriodOverviewResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_period_api_admin_periods__year___month__delete: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                year: number;
                month: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PeriodDeleteResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_media_budgets_api_admin_periods__year___month__budgets_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                year: number;
                month: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaBudgetsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_media_budgets_api_admin_periods__year___month__budgets_put: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                year: number;
                month: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MediaBudgetsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaBudgetsResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_report_logs_api_admin_report_logs_get: {
        parameters: {
            query?: {
                /** @description sent | error */
                status?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportLogListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resend_report_api_admin_report_logs__log_id__resend_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                log_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportResendResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_settings_api_admin_settings_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeatureFlagOut"][];
                };
            };
        };
    };
    update_setting_api_admin_settings__key__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FeatureFlagUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeatureFlagOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_admin_users_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_user_api_admin_users_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAdminCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_active_api_admin_users__user_id__active_patch: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserActiveUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_profile_api_admin_users__user_id__profile_patch: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reset_password_api_admin_users__user_id__reset_password_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPasswordReset"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_role_api_admin_users__user_id__role_patch: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserRoleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserLogin"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_me_api_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
        };
    };
    update_me_api_auth_me_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_password_api_auth_me_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChange"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_api_auth_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessTokenResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_api_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_audit_logs_api_dev_audit_logs_get: {
        parameters: {
            query?: {
                /** @description 대상 기업으로 거르기 */
                company_id?: number | null;
                /** @description 행위 종류로 거르기 (예: user.create) */
                action?: string | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditLogListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_companies_api_dev_companies_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyListResponse"];
                };
            };
        };
    };
    create_company_api_dev_companies_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_company_api_dev_companies__company_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_company_active_api_dev_companies__company_id__active_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyActiveUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    issue_company_admin_api_dev_companies__company_id__admin_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminIssueRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_company_budget_api_dev_companies__company_id__budget_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompanyBudgetUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_trial_api_dev_trials_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrialCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrialOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    extend_trial_api_dev_trials__company_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                company_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrialExtend"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompanyOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_dev_users_get: {
        parameters: {
            query?: {
                /** @description 지정하면 그 기업 소속만 */
                company_id?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_user_api_dev_users_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevUserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_dev_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_active_api_dev_users__user_id__active_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevUserActiveUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_profile_api_dev_users__user_id__profile_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevUserProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reset_user_password_api_dev_users__user_id__reset_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevUserPasswordReset"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_role_api_dev_users__user_id__role_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DevUserRoleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlock_user_api_dev_users__user_id__unlock_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DevUserOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    heading_history_api_heading_history_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description 파일명·문구 검색어 */
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeadingHistoryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_heading_history_api_heading_history__suggestion_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                suggestion_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    heading_history_image_api_heading_history__suggestion_id__image_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                suggestion_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    suggest_headings_api_heading_suggest_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_suggest_headings_api_heading_suggest_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeadingSuggestionRecord"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    analyze_endpoint_api_image_filter_analyze_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_analyze_endpoint_api_image_filter_analyze_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ElementAnalysis"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    background_styles_endpoint_api_image_filter_background_styles_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackgroundStyle"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    backgrounds_endpoint_api_image_filter_backgrounds_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_backgrounds_endpoint_api_image_filter_backgrounds_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackgroundSuggestion"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    edit_endpoint_api_image_filter_edit_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_edit_endpoint_api_image_filter_edit_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    batch_endpoint_api_image_resize_batch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_batch_endpoint_api_image_resize_batch_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    presets_endpoint_api_image_resize_presets_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaPreset"][];
                };
            };
        };
    };
    resize_endpoint_api_image_resize_resize_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_resize_endpoint_api_image_resize_resize_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    parse_keyword_compare_api_keyword_compare_parse_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_parse_keyword_compare_api_keyword_compare_parse_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompareResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_comment_api_marketing_comment_post: {
        parameters: {
            query: {
                year: number;
                month: number;
                /** @description 데이터가 그대로여도 새로 생성한다 */
                force?: boolean;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_excel_periods_api_marketing_excel_periods_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_list_excel_periods_api_marketing_excel_periods_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExcelPeriodListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_excel_api_marketing_export_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_export_excel_api_marketing_export_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_db_excel_api_marketing_export_db_get: {
        parameters: {
            query: {
                year: number;
                month: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_export_task_result_api_marketing_export_db_result__task_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                task_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_export_db_task_api_marketing_export_db_task_post: {
        parameters: {
            query: {
                year: number;
                month: number;
                deliver_by?: string;
                /** @description 받는 사람 이메일. 반복 지정하거나 쉼표로 묶을 수 있고, 생략 시 로그인 계정 */
                recipient?: string[] | null;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_export_task_status_api_marketing_export_db_task__task_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                task_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_export_task_api_marketing_export_db_task__task_id__delete: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                task_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    load_excel_api_marketing_load_excel_post: {
        parameters: {
            query?: {
                /** @description 읽을 기간 시트 (예: period=26년 5월&period=26년 6월). 생략 시 전체 */
                period?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_load_excel_api_marketing_load_excel_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExcelReportBundle"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_periods_api_marketing_periods_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_report_api_marketing_preview_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_preview_report_api_marketing_preview_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_row_api_marketing_rows_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RowUpsertBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_row_api_marketing_rows_delete: {
        parameters: {
            query: {
                report_date: string;
                campaign_type: string;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_excel_data_api_marketing_save_excel_data_post: {
        parameters: {
            query?: {
                replace?: boolean;
                /** @description 저장할 기간 시트 (예: period=26년 5월&period=26년 6월). 생략 시 전체 */
                period?: string[] | null;
                /** @description 파일에 담긴 기간 코멘트도 함께 저장 */
                save_comment?: boolean;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_save_excel_data_api_marketing_save_excel_data_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_save_excel_task_api_marketing_save_excel_task_post: {
        parameters: {
            query?: {
                replace?: boolean;
                /** @description 저장할 기간 시트 (예: period=26년 5월&period=26년 6월). 생략 시 전체 */
                period?: string[] | null;
                /** @description 파일에 담긴 기간 코멘트도 함께 저장 */
                save_comment?: boolean;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_start_save_excel_task_api_marketing_save_excel_task_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_save_excel_task_status_api_marketing_save_excel_task__task_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                task_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_task_status_api_marketing_status__task_id__get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                task_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskStatusResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_summary_api_marketing_summary_get: {
        parameters: {
            query: {
                year: number;
                month: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    undo_upload_api_marketing_undo__undo_id__post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                undo_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_files_api_marketing_upload_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_files_api_marketing_upload_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadTaskResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_alerts_api_rank_monitor_alerts_get: {
        parameters: {
            query?: {
                /** @description 특정 감시의 이력만 */
                watch_id?: number | null;
                limit?: number;
                offset?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlertLogListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_alerts_now_api_rank_monitor_alerts_run_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlertSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_collect_now_api_rank_monitor_collect_run_post: {
        parameters: {
            query?: {
                /** @description 수집할 날짜 (기본: 어제) */
                stat_date?: string | null;
                /** @description 키워드 ID를 다시 찾는다 */
                force_resolve?: boolean;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    collect_status_api_rank_monitor_collect_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectStatus"];
                };
            };
        };
    };
    upload_snapshot_report_api_rank_monitor_snapshots_upload_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_snapshot_report_api_rank_monitor_snapshots_upload_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SnapshotUploadResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_watches_api_rank_monitor_watches_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_watches_api_rank_monitor_watches_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WatchBulkCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchBulkCreateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_watch_api_rank_monitor_watches__watch_id__delete: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                watch_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchDeleteResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_watch_api_rank_monitor_watches__watch_id__patch: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                watch_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WatchUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    watch_bid_estimate_api_rank_monitor_watches__watch_id__bid_estimate_get: {
        parameters: {
            query?: {
                max_position?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                watch_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BidEstimateResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    watch_history_api_rank_monitor_watches__watch_id__history_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                watch_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchHistoryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    watch_insight_api_rank_monitor_watches__watch_id__insight_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path: {
                watch_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KeywordInsightResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_logs_api_report_mail_logs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LogResponse"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_report_api_report_mail_preview_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PreviewReportRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreviewReportResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_report_api_report_mail_send_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendReportRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_report_sync_api_report_mail_send_sync_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Company-Id"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendReportRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_flags_api_settings_flags_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: boolean;
                    };
                };
            };
        };
    };
    healthz_healthz_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
}
