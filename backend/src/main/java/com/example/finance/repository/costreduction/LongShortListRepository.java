package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.LongShortList;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LongShortListRepository extends MongoRepository<LongShortList, String> {

    Optional<LongShortList> findByProjectId(String projectId);

    boolean existsByProjectId(String projectId);
}
