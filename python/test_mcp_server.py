from unittest.mock import Mock

import mcp_server
from spider import QueryError


def test_query_empty_is_complete(monkeypatch):
    monkeypatch.setattr(mcp_server, "query_reports", lambda *args: [])
    result = mcp_server.query_annual_reports_tool("000001")
    assert result["success"] is True
    assert result["status"] == "complete"
    assert result["count"] == 0


def test_query_partial_reports_survive_tool_and_resource(monkeypatch):
    rows = [{"secCode": "000001", "announcementTitle": "2024年年度报告"}]
    monkeypatch.setattr(
        mcp_server,
        "query_reports",
        Mock(side_effect=QueryError(["page two failed"], rows, True)),
    )
    result = mcp_server.query_annual_reports_tool("000001")
    assert result["status"] == "partial"
    assert result["count"] == 1
    assert result["error"] == "page two failed"
    resource = mcp_server.get_annual_reports_list("000001")
    assert "Query incomplete" in resource
    assert "2024年年度报告" in resource


def test_query_outage_is_error(monkeypatch):
    monkeypatch.setattr(
        mcp_server, "query_reports", Mock(side_effect=QueryError(["offline"]))
    )
    result = mcp_server.query_annual_reports_tool("000001")
    assert result["status"] == "error"
    assert result["success"] is False
    assert "No annual reports found" not in result["message"]


def test_invalid_download_does_not_create_directory(tmp_path):
    target = tmp_path / "invalid"
    result = mcp_server.download_annual_reports_tool("", save_path=str(target))
    assert result["status"] == "error"
    assert not target.exists()


def test_default_tool_inventory_is_read_only():
    tools = mcp_server.mcp._tool_manager._tools
    assert set(tools) == {"query_annual_reports_tool"}
    annotations = tools["query_annual_reports_tool"].annotations
    assert annotations.read_only_hint is True
    assert annotations.destructive_hint is False
    assert annotations.idempotent_hint is True
    assert annotations.open_world_hint is True


def test_download_path_must_stay_inside_explicit_root(monkeypatch, tmp_path):
    monkeypatch.setenv("CNINFO_MCP_DOWNLOAD_ROOT", str(tmp_path / "allowed"))
    download = Mock()
    monkeypatch.setattr(mcp_server, "download_reports", download)
    result = mcp_server.download_annual_reports_tool(
        "000001", save_path="../outside"
    )
    assert result["status"] == "error"
    assert "inside CNINFO_MCP_DOWNLOAD_ROOT" in result["error"]
    download.assert_not_called()


def test_download_uses_relative_path_under_explicit_root(monkeypatch, tmp_path):
    root = tmp_path / "allowed"
    monkeypatch.setenv("CNINFO_MCP_DOWNLOAD_ROOT", str(root))
    download = Mock(return_value={"success": True, "status": "complete"})
    monkeypatch.setattr(mcp_server, "download_reports", download)
    result = mcp_server.download_annual_reports_tool(
        "000001", save_path="reports"
    )
    assert result["status"] == "complete"
    assert download.call_args.kwargs["save_path"] == str(root / "reports")
