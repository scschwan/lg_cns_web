// frontend/src/pages/auth/RegisterPage.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import authService from '../../services/authService';
import {
    Container,
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Alert
} from '@mui/material';
import styles from './RegisterPage.module.css';

function RegisterPage() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (formData.password.length < 8) {
            setError('비밀번호는 최소 8자 이상이어야 합니다.');
            return;
        }

        setLoading(true);

        try {
            await authService.register({
                name: formData.name,
                email: formData.email,
                password: formData.password
            });

            alert('회원가입이 완료되었습니다. 로그인해주세요.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.message || '회원가입에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Box className={styles.container}>
                <Paper elevation={3} className={styles.paper}>
                    <Typography component="h1" variant="h4" className={styles.title}>
                        Finance Tool
                    </Typography>
                    <Typography variant="h6" className={styles.subtitle}>
                        회원가입
                    </Typography>

                    {error && (
                        <Alert severity="error" className={styles.errorAlert}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit} className={styles.form}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="name"
                            label="이름"
                            name="name"
                            autoComplete="name"
                            autoFocus
                            value={formData.name}
                            onChange={handleChange}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label="이메일"
                            name="email"
                            autoComplete="email"
                            value={formData.email}
                            onChange={handleChange}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="비밀번호 (8자 이상)"
                            type="password"
                            id="password"
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={handleChange}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="confirmPassword"
                            label="비밀번호 확인"
                            type="password"
                            id="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            className={styles.submitButton}
                            disabled={loading}
                        >
                            {loading ? '처리 중...' : '회원가입'}
                        </Button>
                        <Box className={styles.linkBox}>
                            <Link to="/login" className={styles.link}>
                                <Typography variant="body2" color="primary">
                                    이미 계정이 있으신가요? 로그인
                                </Typography>
                            </Link>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
}

export default RegisterPage;