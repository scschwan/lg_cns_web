package com.example.finance.repository.costreduction;

import com.example.finance.model.costreduction.LongShortList;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LongShortListRepository extends MongoRepository<LongShortList, String> {

    Optional<LongShortList> findFirstByProjectId(String projectId);

    boolean existsByProjectId(String projectId);
}
