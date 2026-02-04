package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 전처리 키워드 데이터
 *
 * MongoDB 컬렉션: process_view_data
 *
 * Step 3 (Preprocessing)에서 키워드 추출 시 생성
 * Step 4 (Transform) 이후 money 합산에 사용
 */
@Document(collection = "process_view_data")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@CompoundIndex(name = "session_raw_idx", def = "{'session_id': 1, 'raw_data_id': 1}")
public class ProcessViewData {

    @Id
    private String id;

    /**
     * 세션 ID
     */
    @Indexed
    @Field("session_id")
    private String sessionId;

    /**
     * 프로젝트 ID
     */
    @Indexed
    @Field("project_id")
    private String projectId;

    /**
     * process_data._id 참조
     */
    @Indexed
    @Field("process_data_id")
    private String processDataId;

    /**
     * 원본 raw_data._id 참조
     */
    @Field("raw_data_id")
    private String rawDataId;

    /**
     * 추출된 최종 키워드 목록
     */
    @Field("keywords")
    @Builder.Default
    private Keywords keywords = new Keywords();

    /**
     * 금액 (session의 amountColumn 값)
     */
    @Field("money")
    private String money;

    /**
     * 부서 (session의 costCenterColumn 값)
     */
    @Field("department")
    private String department;

    /**
     * 공급업체 (session의 supplierColumn 값)
     */
    @Field("supplier")
    private String supplier;

    /**
     * 수정 시간
     */
    @Field("last_modified_date")
    private LocalDateTime lastModifiedDate;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Keywords {
        @Field("final_keywords")
        @Builder.Default
        private List<String> finalKeywords = new ArrayList<>();
    }
}
