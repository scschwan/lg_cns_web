import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PrivateRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div>로딩 중...</div>;
    }

    return isAuthenticated ? children : <Navigate to="/login" />;
}

export default PrivateRoute;