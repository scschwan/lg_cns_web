// frontend/src/components/common/ProgressDialog.jsx

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

function ProgressDialog({ open, message, value }) {
    return (
        <Dialog open={open}>
            <DialogContent className="sm:max-w-md" hideClose>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        처리 중...
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Progress
                        value={value !== undefined ? value : undefined}
                        className="h-2"
                    />

                    <p className="text-sm text-center text-muted-foreground">
                        {message}
                    </p>

                    {value !== undefined && (
                        <p className="text-xs text-center text-muted-foreground">
                            {Math.round(value)}%
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ProgressDialog;