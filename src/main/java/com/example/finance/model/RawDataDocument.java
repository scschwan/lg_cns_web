package com.example.finance.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "raw_data")
public class RawDataDocument {

    @Id
    private String id;

    @Indexed
    private String sessionId;

    @Indexed
    private String uploadId;

    private Integer rowNumber;

    private Map<String, Object> data;

    @Indexed
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}