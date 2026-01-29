// frontend/src/components/upload/PartitionDialog.jsx

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Info } from 'lucide-react';

function PartitionDialog({ open, partitions, onClose, onApprove }) {
    const [editedPartitions, setEditedPartitions] = useState([]);
    const [selectedPartitions, setSelectedPartitions] = useState([]);

    useEffect(() => {
        if (open && partitions) {
            setEditedPartitions(
                partitions.map((p, index) => ({
                    ...p,
                    selected: true,
                    sessionName: p.sessionName || `${p.accountName}_session_${index + 1}`,
                }))
            );
            setSelectedPartitions(partitions.map((_, index) => index));
        }
    }, [open, partitions]);

    const handleTogglePartition = (index) => {
        setSelectedPartitions((prev) =>
            prev.includes(index)
                ? prev.filter((i) => i !== index)
                : [...prev, index]
        );
    };

    const handleToggleAll = () => {
        if (selectedPartitions.length === editedPartitions.length) {
            setSelectedPartitions([]);
        } else {
            setSelectedPartitions(editedPartitions.map((_, i) => i));
        }
    };

    const handleFieldChange = (index, field, value) => {
        setEditedPartitions((prev) =>
            prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
        );
    };

    const handleApprove = () => {
        const approved = editedPartitions.filter((_, index) =>
            selectedPartitions.includes(index)
        );
        onApprove(approved);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>파티션 분석 결과</DialogTitle>
                </DialogHeader>

                <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                        계정명별로 파일이 자동 그룹핑되었습니다. 세션명과 작업자명을 확인하고 승인해주세요.
                    </AlertDescription>
                </Alert>

                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <Checkbox
                                        checked={
                                            selectedPartitions.length === editedPartitions.length &&
                                            editedPartitions.length > 0
                                        }
                                        onCheckedChange={handleToggleAll}
                                    />
                                </TableHead>
                                <TableHead>계정명</TableHead>
                                <TableHead className="min-w-[200px]">세션명</TableHead>
                                <TableHead className="min-w-[150px]">작업자명</TableHead>
                                <TableHead className="text-center">파일 수</TableHead>
                                <TableHead className="text-center">행 수</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {editedPartitions.map((partition, index) => (
                                <TableRow
                                    key={index}
                                    className={
                                        selectedPartitions.includes(index)
                                            ? 'bg-muted/50'
                                            : ''
                                    }
                                >
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedPartitions.includes(index)}
                                            onCheckedChange={() => handleTogglePartition(index)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {partition.accountName}
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={partition.sessionName}
                                            onChange={(e) =>
                                                handleFieldChange(index, 'sessionName', e.target.value)
                                            }
                                            className="h-8"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            value={partition.workerName || ''}
                                            onChange={(e) =>
                                                handleFieldChange(index, 'workerName', e.target.value)
                                            }
                                            placeholder="작업자명 (선택)"
                                            className="h-8"
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {partition.fileCount}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {partition.totalRows?.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        취소
                    </Button>
                    <Button
                        onClick={handleApprove}
                        disabled={selectedPartitions.length === 0}
                    >
                        {selectedPartitions.length}개 세션 생성
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default PartitionDialog;