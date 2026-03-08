package com.example.finance.model.data;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "session_data")
@CompoundIndexes({
        @CompoundIndex(name = "session_row_idx", def = "{'session_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "project_session_idx", def = "{'project_id': 1, 'session_id': 1}"),
        @CompoundIndex(name = "session_upload_idx", def = "{'session_id': 1, 'upload_id': 1}"),
        @CompoundIndex(name = "raw_data_rownum_idx", def = "{'raw_data_id': 1, 'row_number': 1}"),
        @CompoundIndex(name = "session_hidden_idx", def = "{'session_id': 1, 'is_hidden': 1}")
})
public class SessionDataDocument {

    @Id
    private String id;

    @Field("project_id")
    private String projectId;

    @Field("session_id")
    private String sessionId;

    @Field("raw_data_id")
    private String rawDataId;

    @Field("upload_id")
    private String uploadId;

    @Field("row_number")
    private Integer rowNumber;

    private Map<String, Object> data;

    @Field("is_hidden")
    @Builder.Default
    private Boolean isHidden = false;

    @Field("created_at")
    private LocalDateTime createdAt;
}
